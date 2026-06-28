# 🗺️ Street Guesser

**Street Guesser** is an interactive web-based map trivia game built with HTML5, CSS3, JavaScript, and Leaflet. Test your local knowledge by guessing the names of all streets within any boundary! Search for a specific city or district, or draw a custom shape directly on the map.

## 🚀 Play Online
The game is hosted on Firebase Hosting and auto-deployed on commits to the `main` branch.

---

## ✨ Features

- **Double Input Modes**: 
  - **Search**: Search for any city/neighborhood (e.g. "Soho, London") to get boundary limits.
  - **Custom Draw**: Draw your own polygon boundary on the map to define the trivia area.
- **Real-Time Data**: Extracts driving/residential streets directly from OpenStreetMap using the Overpass API.
- **Fuzzy Street Matching**: Supports local names and English/transliterated versions.
- **🔥 Streak Counter**: Tracks your consecutive correct guesses. Resets when you type a name that doesn't exist inside the boundary.
- **🎉 Confetti Animations**: Correct guesses trigger a celebratory confetti effect when you get a streak (3 or more streets in a row).
- **Interactive Map**: Correctly guessed streets light up in glowing green and can be clicked to reveal their full name.

---

## 🛠️ Technology Stack

- **Core**: Vanilla HTML5 & JavaScript (ES6)
- **Styling**: Vanilla CSS3 (modern glassmorphic UI, custom transitions, dark mode theme)
- **Maps**: [Leaflet.js](https://leafletjs.com/) for map rendering & [Leaflet Draw](https://github.com/Leaflet/Leaflet.draw) for polygon drafting
- **Tile Layer**: CartoDB Dark Matter (no labels, to prevent cheating)
- **Confetti**: [Canvas Confetti](https://github.com/catdad/canvas-confetti)
- **Data Source**: OpenStreetMap (OSM) via Overpass API

---

## 💻 Local Setup & Development

1. Clone this repository:
   ```bash
   git clone https://github.com/Temxix/street_guesser.git
   cd street_guesser
   ```
2. Simply open `index.html` in any web browser, or serve it using a local server (like Live Server in VS Code, or python):
   ```bash
   python -m http.server 8000
   ```
3. Open `http://localhost:8000` in your browser.

---

## 🚀 Firebase Hosting & CI/CD Auto-Deploy

This project uses **GitHub Actions** to automatically deploy the game to Firebase Hosting on every commit pushed to the `main` branch.

### How to set up deployment:

1. **Local Firebase configuration**:
   - The project is configured with `firebase.json` and `.firebaserc` pointing to the project ID `street-guesser-fb774`.
2. **GitHub Secrets**:
   - To authorize GitHub Actions, generate a Firebase Service Account key:
     1. Go to the **Firebase Console** -> **Project Settings** -> **Service Accounts**.
     2. Click **Generate new private key** and download the JSON.
     3. Go to your **GitHub Repository** -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.
     4. Name the secret `FIREBASE_SERVICE_ACCOUNT_STREET_GUESSER_FB774` and paste the entire content of the downloaded JSON key.
3. Push to `main` branch to trigger the auto-deploy workflow!