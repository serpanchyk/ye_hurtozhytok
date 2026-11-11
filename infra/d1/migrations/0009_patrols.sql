CREATE TABLE `patrol_members` (
	`patrol_id` integer NOT NULL,
	`resident_id` integer NOT NULL,
	PRIMARY KEY(`patrol_id`, `resident_id`),
	FOREIGN KEY (`patrol_id`) REFERENCES `patrols`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resident_id`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `patrols` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`created_by` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `residents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `patrols_date_idx` ON `patrols` (`date`);--> statement-breakpoint
ALTER TABLE `tasks` ADD `patrol_id` integer;