CREATE TABLE `career_saves` (
	`user_id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 3 NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL
);
