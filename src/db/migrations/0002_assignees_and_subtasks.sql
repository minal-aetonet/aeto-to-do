CREATE TABLE `subtasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subtasks_task_idx` ON `subtasks` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_assignees` (
	`task_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`assigned_at` text NOT NULL,
	PRIMARY KEY(`task_id`, `user_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_assignees_user_idx` ON `task_assignees` (`user_id`);--> statement-breakpoint
DROP INDEX `tasks_user_idx`;--> statement-breakpoint
ALTER TABLE `tasks` ADD `created_by` integer REFERENCES users(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `tasks_created_by_idx` ON `tasks` (`created_by`);--> statement-breakpoint
-- Data migration (hand-written): every existing owner becomes the task's creator and only assignee.
INSERT INTO `task_assignees` (`task_id`, `user_id`, `assigned_at`) SELECT `id`, `user_id`, `created_at` FROM `tasks` WHERE `user_id` IS NOT NULL;--> statement-breakpoint
UPDATE `tasks` SET `created_by` = `user_id` WHERE `user_id` IS NOT NULL;
