import './app.css'
import { runMigrations } from './lib/storage.js'
import { initAudio } from './lib/audio.js'
import { mount } from 'svelte'
import App from './App.svelte'

runMigrations()  // normalise localStorage schema before any reads
initAudio()      // generate WAV blobs before mount (no user gesture needed)

mount(App, { target: document.getElementById('app') })
