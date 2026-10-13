// Entry point: load fonts + styles, boot the game, report fatal errors clearly.
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/600.css';
import './style.css';
import { Game } from './core/Game.js';

function showFatal(message) {
  const boot = document.getElementById('boot-screen');
  if (boot) {
    boot.classList.remove('gone');
    boot.querySelector('.boot-text').textContent = message;
  }
  console.error('[BloodMoon] Fatal:', message);
}

function boot() {
  const canvas = document.getElementById('game-canvas');
  const uiRoot = document.getElementById('ui-root');
  let game;
  try {
    game = new Game(canvas, uiRoot);
  } catch (err) {
    showFatal(err?.message || 'The game could not start (WebGL unavailable?).');
    return;
  }
  game.start();
  // fade out the boot screen once the first frames are drawn
  setTimeout(() => document.getElementById('boot-screen')?.classList.add('gone'), 600);
}

window.addEventListener('error', (e) => console.error('[BloodMoon] Uncaught error:', e.error || e.message));
boot();
