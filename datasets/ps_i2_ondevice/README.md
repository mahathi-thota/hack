# PS-I2 dataset — Parallel Indic form corpus and device profiles

`python generate.py` regenerates everything deterministically (SEED = 20260806).

## Layout
```
public/forms/forms.jsonl        120 forms, each rendered in all 7 languages
public/forms/qa_flat.csv        5,040 QA items (720 per language)
public/fertility_probe.json     5 sentences × 7 languages, identical meaning
public/device_profiles.json     4 handset profiles incl. a mid-range reference
public/telemetry_schema.json    the fields your harness must emit
public/telemetry_HARNESS_TEST_ONLY.jsonl  zeroed fixture — not data
```

Languages: en, hi, bn, te, ta, mr, kn. Three form types (ration card,
post-matric scholarship, old-age pension) with real eligibility rules attached.

## Why the corpus is parallel
Every form carries **the same semantic content in all seven languages**, and
extraction answers are the same value in each script. So a per-language accuracy
gap is attributable to the model and the tokeniser, not to the questions being
harder in Tamil. This is what makes the required per-language degradation
measurement meaningful; an aggregate number across a non-parallel corpus is
confounded and tells you nothing.

Field values are in native script, not Latin transliteration. Two QA types:
`extraction` (5 per form) and `reasoning` (1 per form — an eligibility yes/no
that requires comparing income against a cap and household size against a floor;
68/120 are `yes`).

## Tokeniser fertility
The probe set makes the inflation measurable. UTF-8 bytes per character, which
is a floor for byte-level BPE tokenisers:

| en | hi | bn | te | ta | mr | kn |
|---|---|---|---|---|---|---|
| 1.00 | 2.62 | 2.70 | 2.73 | 2.78 | 2.70 | 2.73 |

Run your actual tokeniser over the probe and report tokens per sentence per
language. A 3–5× fertility ratio against English means 3–5× the KV-cache, the
prefill time and the context pressure — on the devices with the least of all
three. Report the ratio before and after any tokeniser work you do.

## What this dataset deliberately does NOT contain
**No latency, memory, or model-quality numbers.** None. The telemetry file is
zeroed on purpose and exists only so you can build the reporting path before
your handset is in hand. Every performance figure in your submission must come
from a real device: cold-start load from flash, sustained throughput after
thermal throttling, and peak RSS under background memory pressure. A simulated
number presented as a measurement is a disqualifying claim, and the profiles in
`device_profiles.json` are targets to test against, not a simulator to report from.

D4 is a mid-range reference device included for one purpose: so you can quantify
what you lost relative to a comfortable device. Do not demo on it.
