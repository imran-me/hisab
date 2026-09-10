/**
 * Hisab · Categories
 *
 * There is no categories feature yet. This exists because the shell is mounted by
 * each page's own script rather than by main.js, so a page without one renders
 * its markup with an empty header and an empty tab bar — which looks like a
 * broken app rather than an unbuilt one. That is the whole job here.
 *
 * It is replaced outright when the categories module is written. Nothing in this
 * file is a foundation to build on.
 */

import { mountShell } from '../../shared/js/components/shell.js';

mountShell({ title: 'Categories' });
