CREATE TABLE `task_assignees` (
	`task_id` integer NOT NULL,
	`resident_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`task_id`, `resident_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_assignees_resident_idx` ON `task_assignees` (`resident_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`board` text NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`place` text,
	`status` text DEFAULT 'new' NOT NULL,
	`public` integer DEFAULT false NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`done_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_board_status_idx` ON `tasks` (`board`,`status`,`deleted_at`);