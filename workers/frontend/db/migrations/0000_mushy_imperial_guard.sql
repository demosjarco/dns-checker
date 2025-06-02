CREATE TABLE `instances` (
	`do_id` blob PRIMARY KEY NOT NULL,
	`do_id_hex` text GENERATED ALWAYS AS (lower(hex("do_id"))) VIRTUAL,
	`location` text NOT NULL,
	`iata` text NOT NULL,
	`iso_country` text NOT NULL,
	`iso_region` text,
	FOREIGN KEY (`location`) REFERENCES `locations`(`location`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instances_iata_unique` ON `instances` (`iata`);--> statement-breakpoint
CREATE TABLE `locations` (
	`location` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_insensitive_location` ON `locations` (lower("location"));