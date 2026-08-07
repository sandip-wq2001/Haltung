# Haltung

Haltung is a local-first web application for monitoring upper-body posture and screen-facing head
orientation with a webcam. MediaPipe runs in the browser; video frames are not uploaded or stored.

## Requirements

- Node.js 22 and npm
- JDK 21 or newer
- Python 3.11 or newer (evaluation only)
- A webcam and a current Chromium-based browser

## Install the frontend

From the repository root:

```bash
npm ci --prefix frontend
```

The MediaPipe models and WebAssembly runtime required by the application are already stored under
`frontend/public/mediapipe/`, so the application does not fetch them from a CDN at runtime.

## Run the application

Start the backend in one terminal:

```bash
backend/mvnw -f backend/pom.xml spring-boot:run
```

Start the frontend in a second terminal:

```bash
npm start --prefix frontend
```

Open `http://localhost:4200/`. The available workflows are:

- `/calibration` — capture a personal calibration profile;
- `/live` — run the calibrated live monitor;
- `/threshold` — inspect attention/head-orientation measurements;
- `/posture` — inspect posture measurements;
- `/record` — run the scripted research recorder.

The backend listens on `http://127.0.0.1:8000` and stores calibration profiles in a local H2
database. If it is unavailable, the frontend falls back to browser local storage.

## Tests

```bash
npm test --prefix frontend
backend/mvnw -f backend/pom.xml test
python3 -m unittest discover -s eval -p 'test_*.py' -v
node --test eval/*.test.mjs
```

Build the frontend with:

```bash
npm run build --prefix frontend
```

## Evaluation

The final standard-library Python evaluator and its unit tests are under `eval/`. The complete
frozen evaluation evidence is under `eval/results/`, including CSV and JSON outputs, summaries,
run records, the input-coverage heatmap, and the primary-comparison figure.

Raw participant recordings are intentionally excluded. They contain human-subject landmark data
and are not licensed for public distribution. Consequently, a public clone can run the evaluator's
unit tests and inspect the frozen derived results, including participant-level tables, but exact
replay requires separately authorized access to the protected recordings.

## Privacy

The application processes the webcam locally. Raw video and audio are not recorded by the
application, and no runtime inference data is sent to an external service.
