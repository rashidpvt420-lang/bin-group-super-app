# Property map link preview fix

This hotfix documents the owner onboarding map issue reported from production.

## Root cause

The property location step accepted Google Maps share links, but the preview map only updated when the pasted text already exposed coordinates. Short Google Maps links such as `maps.app.goo.gl/...` hide the coordinates behind a redirect, so the browser could not extract the property pin and the preview stayed on the default emirate coordinates.

## Fix

- Detect Google Maps URLs pasted into either the Property Address field or Google Maps URL field.
- Extract coordinates from expanded Google Maps formats including `@lat,lng`, `q=lat,lng`, `center=lat,lng`, `!3dlat!4dlng`, and related query forms.
- Preserve pasted Google Maps links for the Open Google Maps button.
- Stop sending Google Maps URLs to OpenStreetMap/Nominatim as if they were normal addresses.
- Show a clear info/warning message for short `maps.app.goo.gl` links because their coordinates cannot be read client-side until the link is expanded.

## Expected behavior

Owners can paste full Google Maps URLs or direct coordinates and the preview pin updates. If they paste a short share link, the app explains that the link must be opened and copied again as a full URL or exact coordinates.