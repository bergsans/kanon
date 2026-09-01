# French and Italian, via Gutenberg

[← back to README](../../README.md)

**The French and Italian canon needed no new source.** They were already in the
catalog the repo fetches from: Gutenberg has 4,168 French and 1,103 Italian
texts, and `build-corpus.ts` discards them on every run at the line
`language === "en"`. Descartes, Montaigne, Montesquieu, Voltaire, Diderot,
Tocqueville, Comte, Renan, Taine, Hugo, Balzac, Flaubert, Stendhal, Zola,
Proust, Molière, Corneille, La Fontaine — and in Italian, Dante, Machiavelli,
Ariosto, Leopardi, Manzoni. Same fetch module, same rights basis, same edition
check. The only thing new is the language.

The Italian part is small, and the catalog is why: of 1,103 texts only about
thirty are canon, and Tasso, Petrarch, Galileo, Goldoni, Foscolo, Castiglione
and Croce are entirely missing. Anyone wanting them should look to Liber Liber
or Wikisource.

