# Frozen evaluation results

This directory contains the complete frozen outputs used for the thesis evaluation. The files were
copied unchanged from their original evidence directories so that the recorded results, figures,
tables, and checksums remain together.

## Contents

- `00-dataset-freeze/` — session inventory, exclusions, checksums, verifier results, segment
  coverage, method, summary, and the original run record.
- `01-data-quality/` — input-availability results, session and segment tables, the Excel workbook,
  worked example, and the coverage heatmap in PNG and SVG formats.
- `02-primary-comparison/` — participant-, segment-, and summary-level classifier results,
  calibration checks, paired differences, coverage, and the primary comparison figure in PNG and
  SVG formats.

Some frozen method and run files mention their original locations under
`docs/research/participant-evaluation/`. Those paths are retained as historical evidence; the
corresponding public files now live under `eval/results/`. A historical reference to an internal
metric specification is also retained, but that thesis working document is intentionally excluded
from this clean public snapshot.

Raw participant recordings are not included. They contain human-subject landmark data. The public
repository therefore supports inspection of all frozen derived results and execution of the
synthetic unit tests, while an exact replay requires separately authorized access to the protected
recordings.
