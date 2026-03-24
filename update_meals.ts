import { updateMealDatabase } from './server/mealScraper.js';

async function updateAll() {
  try {
    await updateMealDatabase();
    console.log('Update complete!');
  } catch (e) {
    console.error(e);
  }
}

updateAll();
