# Polarity - Flashpoint Integration

The Flashpoint API empowers experienced and entry-level users with the context they need to make better risk decisions about relevant threats such as cybercrime, fraud, and physical threats.

The Polarity Flashpoint integration allows Polarity to search Flashpoint's Indicators API to return threat information on IP's, Domains and File Hashes.

For more information on Flashpoint, please visit [official website](https://www.flashpoint-intel.com/).

Check out the integration in action:

## Flashpoint Integration Options

### Flashpoint API Base URL
The base URL for the Flashpoint API.  Defaults to https://fp.tools/api/v4/

### Flashpoint API Key

Valid Flashpoint API key generated on the "APIs & Integrations" page of fp.tools

### Domain and IP Blacklist

This is an alternate option that can be used to specify domains or IPs that you do not want sent to Flashpoint.  The data must specify the entire IP or domain to be blocked (e.g., www.google.com is treated differently than google.com).

### Domain Blacklist Regex

This option allows you to specify a regex to blacklist domains.  Any domain matching the regex will not be looked up.  If the regex is left blank then no domains will be blacklisted.

### IP Blacklist Regex

This option allows you to specify a regex to blacklist IPv4 Addresses.  Any IPv4 matching the regex will not be looked up.  If the regex is left blank then no IPv4s will be blacklisted.

## Installation Instructions

Installation instructions for integrations are provided on the [PolarityIO GitHub Page](https://polarityio.github.io/).

## Polarity

Polarity is a memory-augmentation platform that improves and accelerates analyst decision making.  For more information about the Polarity platform please see:

https://polarity.io/
