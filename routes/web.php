<?php

/*
|------------------------------------------------------------------------------
| Web routes - deliberately empty
|------------------------------------------------------------------------------
|
| Hisab's frontend is static HTML served directly by the web server. Laravel
| never renders a page here: it answers /api/* and nothing else, which is what
| lets the whole frontend keep working with the backend switched off.
|
| A route added to this file would be a second way to reach the app, on a
| different origin path, with none of the .htaccess protections that the static
| tree relies on. If you are about to add one, it belongs in routes/api.php.
|
*/
