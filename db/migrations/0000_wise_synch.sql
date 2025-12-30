CREATE TABLE `global_servers` (
	`doh` text,
	`dot` text,
	CONSTRAINT "global_servers_has_dns_endpoint" CHECK(("global_servers"."doh" is not null or "global_servers"."dot" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `global_servers_doh_unique` ON `global_servers` (`doh`);--> statement-breakpoint
CREATE UNIQUE INDEX `global_servers_dot_unique` ON `global_servers` (`dot`);--> statement-breakpoint
INSERT INTO `global_servers` (`doh`, `dot`) VALUES
	('https://cloudflare-dns.com/dns-query', NULL),
	('https://security.cloudflare-dns.com/dns-query', NULL),
	('https://dns.google/dns-query', 'tls://dns.google'),
	('https://dns11.quad9.net/dns-query', 'tls://dns11.quad9.net'),
	('https://dns.adguard-dns.com/dns-query', 'tls://dns.adguard-dns.com'),
	('https://wikimedia-dns.org/dns-query', 'tls://wikimedia-dns.org'),
	('https://doh.opendns.com/dns-query', 'tls://dns.opendns.com');--> statement-breakpoint
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
	`location` text PRIMARY KEY NOT NULL,
	`doh` text DEFAULT '[]' NOT NULL,
	`dot` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_insensitive_location` ON `locations` (lower("location"));