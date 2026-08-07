# Evaluation harness

`evaluate_recordings.py` is an independent, standard-library Python replay of the final posture and
attention rules. It reads the sessions declared in `evaluation-manifest.json`, reconstructs the
classifiers from recorded landmarks, and does not import or trust the Angular classifier outputs.

Run the self-contained tests from the repository root:

```bash
python3 -m unittest discover -s eval -p 'test_*.py' -v
node --test eval/*.test.mjs
```

With separately authorized recordings placed at the paths declared in the manifest, run the final
evaluation with:

```bash
python3 eval/evaluate_recordings.py --output eval/results
```

The complete frozen evaluation evidence is under `eval/results/`:

- `00-dataset-freeze/` contains the dataset inventory, verifier outputs, exclusions, and checksums;
- `01-data-quality/` contains input-availability tables, an Excel workbook, and the coverage
  heatmap in PNG and SVG formats;
- `02-primary-comparison/` contains segment, participant, and summary results together with the
  primary comparison figure in PNG and SVG formats.

Raw recordings remain excluded because they contain human-subject landmark data. The included
unit tests use synthetic fixtures and do not require participant data. Exact replay of the frozen
analysis requires separately authorized access to the protected recordings.
