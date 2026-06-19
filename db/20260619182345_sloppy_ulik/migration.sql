CREATE TABLE `global_servers` (
	`doh` text UNIQUE,
	`dot` text UNIQUE,
	CONSTRAINT "global_servers_has_dns_endpoint" CHECK(((("doh" is not null)) or (("dot" is not null))))
) STRICT;
--> statement-breakpoint
INSERT INTO `global_servers` (`doh`, `dot`) VALUES
	('https://cloudflare-dns.com/dns-query', NULL),
	('https://security.cloudflare-dns.com/dns-query', NULL),
	('https://dns.google/dns-query', 'tls://dns.google'),
	('https://dns11.quad9.net/dns-query', 'tls://dns11.quad9.net'),
	('https://dns.adguard-dns.com/dns-query', 'tls://dns.adguard-dns.com'),
	('https://wikimedia-dns.org/dns-query', 'tls://wikimedia-dns.org'),
	('https://doh.opendns.com/dns-query', 'tls://dns.opendns.com');--> statement-breakpoint
CREATE TABLE `instances` (
	`do_id` blob PRIMARY KEY,
	`do_id_hex` text GENERATED ALWAYS AS (lower(hex("do_id"))) VIRTUAL,
	`location` text NOT NULL,
	`iata` text NOT NULL UNIQUE,
	`iso_country` text NOT NULL,
	`iso_region` text,
	CONSTRAINT `fk_instances_location_locations_location_fk` FOREIGN KEY (`location`) REFERENCES `locations`(`location`) ON UPDATE CASCADE ON DELETE CASCADE
) WITHOUT ROWID, STRICT;
--> statement-breakpoint
CREATE INDEX `instances_location` ON `instances` (`location`);--> statement-breakpoint
CREATE TABLE `locations` (
	`location` text PRIMARY KEY,
	`doh` text DEFAULT '[]' NOT NULL,
	`dot` text DEFAULT '[]' NOT NULL
) WITHOUT ROWID, STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `case_insensitive_location` ON `locations` (lower("location"));