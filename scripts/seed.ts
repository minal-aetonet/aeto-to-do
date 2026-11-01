// Creates a demo account with example categories and tasks: pnpm db:seed
// It only runs when the database has NO accounts yet, so it never touches real users.
import { count } from 'drizzle-orm';
import { config } from '../src/config';
import { closeDatabase, createDatabase, runMigrations } from '../src/db';
import { tasks, users } from '../src/db/schema';
import { todayLocal } from '../src/lib/dates';
import { registerUser } from '../src/services/auth.service';
import { createCategory } from '../src/services/category.service';
import { createTask } from '../src/services/task.service';

const DEMO = { name: 'Demo User', email: 'demo@example.com', password: 'demo-password-123' };

/** Returns today's date moved by a number of days, as "YYYY-MM-DD". */
function daysFromToday(days: number): string {
  const [year, month, day] = todayLocal().split('-').map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const db = createDatabase(config.databasePath);
runMigrations(db);

const userCount = db.select({ value: count() }).from(users).get()!.value;
if (userCount > 0) {
  console.log(`The database already has ${userCount} account(s). Seeding skipped.`);
} else {
  // We reuse the real services, so seeded data follows the same rules as the API.
  // As the first account, the demo user becomes an admin and claims any older tasks.
  const demo = await registerUser(db, DEMO);
  const ownTasks = db.select({ value: count() }).from(tasks).get()!.value;

  if (ownTasks > 0) {
    console.log(`Demo account created and given the ${ownTasks} existing task(s).`);
  } else {
    const work = createCategory(db, demo.id, { name: 'Work', color: '#4f46e5' });
    const home = createCategory(db, demo.id, { name: 'Home', color: '#16a34a' });
    const learning = createCategory(db, demo.id, { name: 'Learning', color: '#d97706' });

    const examples = [
      { title: 'Read the Hono learning manual', description: 'Start with chapters 1 and 2.', status: 'in_progress', priority: 'high', categoryId: learning.id, dueDate: daysFromToday(0) },
      { title: 'Prepare weekly report', description: '', status: 'pending', priority: 'high', categoryId: work.id, dueDate: daysFromToday(-2) },
      { title: 'Buy groceries', description: 'Milk, bread, eggs', status: 'pending', priority: 'medium', categoryId: home.id, dueDate: daysFromToday(1) },
      { title: 'Reply to project emails', description: '', status: 'completed', priority: 'medium', categoryId: work.id, dueDate: daysFromToday(-1) },
      { title: 'Try adding a new task field', description: 'See chapter 16 of the manual.', status: 'pending', priority: 'low', categoryId: learning.id, dueDate: daysFromToday(7) },
      { title: 'Water the plants', description: '', status: 'pending', priority: 'low', categoryId: null, dueDate: null },
    ] as const;

    for (const example of examples) {
      createTask(db, demo, example);
    }
    console.log(`Demo account created with 3 categories and ${examples.length} tasks.`);
  }
  console.log(`  Email:    ${DEMO.email}\n  Password: ${DEMO.password}\n  (Change or delete this account before going to production.)`);
}

closeDatabase(db);
