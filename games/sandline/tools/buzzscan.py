"""Buzz scan: lists stationary narrowband peaks lasting > 1 s in a recorded session.

Usage: python3 -I buzzscan.py <session.wav> [label]

Method: STFT (8192-point, 46 ms hop). A peak is a local spectral maximum 40 Hz..6 kHz that stands >= 15 dB above the
local median spectrum and is no more than 60 dB below the loudest peak. Peaks are chained frame to frame when they
stay within +-1 bin (about 5 Hz), allowing one missing frame; chains of >= 1.0 s are "stationary tones".
For each tone it also counts other stationary tones at its integer multiples (2f..8f, within 30 dB, starting and
stopping with it). Under a dense mix this undercounts partials, so read the list by hand: a long stationary EVEN
harmonic of a note (e.g. the 4th) can only come from a saw / pulse source, because sine, triangle and FM-odd voices
have none. If cap.json (from audiocap/soloscan) sits next to the wav, each tone is tagged with the game phase.
"""
import sys, wave, numpy as np

def load(path):
    w = wave.open(path, 'rb')
    sr, ch, n, sw = w.getframerate(), w.getnchannels(), w.getnframes(), w.getsampwidth()
    raw = w.readframes(n)
    if sw == 2:
        x = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768.0
    else:
        x = np.frombuffer(raw, dtype='<f4').astype(np.float32)
    x = x.reshape(-1, ch).mean(axis=1)
    return x, sr

def scan(x, sr, nfft=8192, hop=2048):
    win = np.hanning(nfft).astype(np.float32)
    frames = 1 + (len(x) - nfft) // hop
    freqs = np.fft.rfftfreq(nfft, 1 / sr)
    lo, hi = np.searchsorted(freqs, 40), np.searchsorted(freqs, 6000)
    top = -200.0
    peaks = []
    for i in range(frames):
        seg = x[i * hop:i * hop + nfft] * win
        mag = 20 * np.log10(np.abs(np.fft.rfft(seg))[lo:hi] / (nfft / 4) + 1e-9)
        # local median over ~ +-15 bins
        k = 31
        pad = np.pad(mag, k // 2, mode='edge')
        shp = (len(mag), k)
        strided = np.lib.stride_tricks.as_strided(pad, shape=shp, strides=(pad.strides[0], pad.strides[0]))
        bg = np.median(strided, axis=1)
        prom = mag - bg
        is_pk = (mag[1:-1] > mag[:-2]) & (mag[1:-1] >= mag[2:]) & (prom[1:-1] >= 15)
        idx = np.nonzero(is_pk)[0] + 1
        if len(idx):
            top = max(top, float(mag[idx].max()))
        peaks.append([(int(b + lo), float(mag[b])) for b in idx])
    tracks, active = [], {}
    for i, pk in enumerate(peaks):
        nxt = {}
        for b, lvl in pk:
            if lvl < top - 60:
                continue
            cand = None
            for d in (0, -1, 1):
                if b + d in active:
                    cand = active.pop(b + d); break
            if cand is None:
                cand = {'b0': b, 'start': i, 'end': i, 'lv': [], 'bins': []}
            cand['end'] = i; cand['lv'].append(lvl); cand['bins'].append(b)
            nxt[b] = cand
        for b, tr in active.items():           # allow one missing frame
            if i - tr['end'] <= 1 and b not in nxt:
                nxt[b] = tr
            else:
                tracks.append(tr)
        active = nxt
    tracks.extend(active.values())
    dt = hop / sr
    out = []
    for tr in tracks:
        dur = (tr['end'] - tr['start'] + 1) * dt
        if dur < 1.0:
            continue
        f = float(np.median([freqs[b] for b in tr['bins']]))
        out.append({'f': f, 't0': tr['start'] * dt, 't1': (tr['end'] + 1) * dt, 'dur': dur, 'lvl': float(np.max(tr['lv']))})
    def has(a, f, floor):
        for b in out:
            # same source: a partial of one oscillator starts and stops with its fundamental
            if b is not a and abs(b['f'] - f) <= max(4.0, 0.006 * f) and b['lvl'] >= floor \
                    and abs(b['t0'] - a['t0']) <= 0.3 and abs(b['t1'] - a['t1']) <= 0.6:
                return True
        return False
    for a in out:
        # Buzz signature, judged with a as the fundamental: a saw/pulse comb (partials 2,3,4,5 all present within
        # 30 dB) or a square comb (3,5,7 within 22 dB), each starting and stopping with a. Consonant chords cannot fill these
        # combs (the 5th partial of a chord root is a major third two octaves up, outside a minor key's triad, and
        # the 7th is out of tune with any scale note), and sine / triangle notes have no partials within 22 dB
        # apart from a triangle's 3rd at -19 dB.
        fl = a['lvl'] - 30
        saw = all(has(a, h * a['f'], fl) for h in (2, 3, 4, 5))
        sq = all(has(a, h * a['f'], a['lvl'] - 22) for h in (3, 5, 7))
        a['partials'] = sum(1 for h in range(2, 9) if has(a, h * a['f'], fl))
        a['f0'] = a['f']
        a['buzz'] = 'saw' if saw else 'square' if sq else ''
    return out, len(x) / sr

EV = []
def phase_at(ts):
    last = ''
    for name, t in EV:
        if t <= ts:
            last = name
    return ('  [' + last + ']') if last else ''

def main():
    import json, os
    path = sys.argv[1]
    cj = os.path.join(os.path.dirname(path), 'cap.json')
    if os.path.exists(cj):
        cap = json.load(open(cj))
        t0 = cap.get('t0') or 0
        for e in cap.get('ev', []):
            if isinstance(e[0], str) and e[0].startswith('round:') and e[1] >= 0:
                EV.append((e[0][6:], e[1] - t0))
    label = sys.argv[2] if len(sys.argv) > 2 else path
    x, sr = load(path)
    tones, secs = scan(x, sr)
    rich = [t for t in tones if t['buzz']]   # full same-source combs only (conservative)
    low = [t for t in tones if t['f'] < 200]
    print('%s: %.0f s, %d stationary tones >= 1 s (%.1f tone-seconds); buzz combs: %d; below 200 Hz: %d' % (
        label, secs, len(tones), sum(t['dur'] for t in tones), len(rich), len(low)))
    def show(lst, title):
        if not lst:
            return
        print('  ' + title)
        for t in sorted(lst, key=lambda t: -t['dur'])[:8]:
            print('    %7.1f Hz  %6.1f s -> %6.1f s  (%.1f s)  %5.1f dB  partials within 30 dB: %d %s%s' % (
                t['f'], t['t0'], t['t1'], t['dur'], t['lvl'], t['partials'], t['buzz'], phase_at(t['t0'])))
    show(rich, 'buzz combs:')
    show([t for t in sorted(tones, key=lambda t: -t['dur']) if t not in rich][:8], 'longest pure tones:')

if __name__ == '__main__':
    main()
