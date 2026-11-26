import type { World } from './types';

export function addJournal(world: World, type: string, nations: number[], text: string, admin = false): void {
  world.journal.push({ id: world.nextJournalId++, tick: world.tick, type, nations, text, ...(admin ? { admin } : {}) });
  // Fenêtre glissante en mémoire ; le serveur archivera le journal complet sur disque.
  if (world.journal.length > world.config.maxJournal) world.journal.splice(0, world.journal.length - world.config.maxJournal);
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const yearOf = (world: World, tick = world.tick) => world.config.startYear + Math.floor(tick / 12);
export const formatDate = (world: World, tick = world.tick) => `${MONTHS[tick % 12]} ${yearOf(world, tick)}`;
