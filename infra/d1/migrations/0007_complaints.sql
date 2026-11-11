CREATE TABLE `complaints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_id` integer,
	`topic` text NOT NULL,
	`body` text NOT NULL,
	`place` text,
	`task_id` integer,
	`reply` text,
	`rejected_at` integer,
	`resolved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `complaints_author_idx` ON `complaints` (`author_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `complaints_task_idx` ON `complaints` (`task_id`);