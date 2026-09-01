/**
 * Generates the collection manifest (`src/lib/corpus.json`) from Project Gutenberg's catalog.
 *
 *   pnpm build-corpus            regenerate
 *   pnpm build-corpus --dry      show the report without writing the file
 *
 * The manifest is checked in. Only rerun it when the author list below changes.
 *
 * Why generate it? The catalog (21 MB CSV, ~79k entries) has everything we
 * need: title, language, Gutenberg ID, author *with lifespan*, and role
 * markers like [Translator]. Hand-picking 350 works would be both slower
 * and more error-prone.
 */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "../src/lib/db";
import { foldName } from "../src/lib/gutenberg";
import type { CanonWork, Genre } from "../src/lib/corpus";
import { eraOf } from "./lib/era";
import { writeManifest } from "./lib/manifest";
import { parseCsv } from "./lib/csv";

const CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
const OUT_PATH = path.join(process.cwd(), "src", "lib", "corpus.json");

/* ------------------------------------------------------------------ *
 * Author lists — the canon
 *
 * The strings must match the catalog's exact author form, INCLUDING the
 * year when the year is needed to tell people apart. Surname alone is
 * dangerous and fails silently:
 *   "Wollstonecraft"   matches Mary Shelley (Shelley, Mary Wollstonecraft)
 *   "Darwin"           matches the golf writer Bernard Darwin
 *   "Emerson"          matches children's author Alice B. Emerson (25 works)
 *   "Hazlitt, William" matches the grandson William Carew Hazlitt (63 works)
 *   "Webster, John"    matches the 17th-century physician, not the playwright
 * The generator warns if a name gets zero matches.
 *
 * An author belongs in ONE list. The list determines the work's genre, and
 * the genre carries all the way through to reranking — so pick the author's
 * primary genre, not each individual work's. Seneca's tragedies land under
 * "philosophy", Voltaire's Candide under "philosophy": that's the price of
 * one label per author.
 * ------------------------------------------------------------------ */

const FILOSOFI = [
  "Plato, 428",
  "Aristotle, 385",
  "Cicero, Marcus Tullius",
  "Seneca, Lucius Annaeus",
  "Epictetus, 55",
  "Marcus Aurelius, Emperor",
  // Diogenes Laertius is the collection's only direct route to the
  // pre-Socratics: his Lives is the source that preserved most of
  // Heraclitus's fragments. Gutenberg has none of them as their own author
  // entry — see the comment at EXTRA.
  "Diogenes Laertius",
  "Plotinus, 205",
  "Porphyry, 234",
  "Proclus, 412",
  "Lucretius Carus, Titus",
  "Augustine, of Hippo, Saint",
  "Thomas, Aquinas, Saint",
  "Boethius, 480",
  // The Middle Ages were a gap: nothing existed between Boethius (480) and
  // Aquinas (1225), and the Arabic and Jewish traditions were entirely
  // absent despite Gutenberg having them.
  "Avicenna, 980",
  // Avicenna alone is not "the Arabic tradition". al-Ghazali's attack on
  // falsafa and Averroes's response to that attack is the dispute that gave
  // Latin Aristotle back — without them Avicenna stands in the collection
  // with no opponent, and Aquinas's commentaries answer no one.
  "Ghazzali, 1058",
  "Averroës, 1126",
  "Abelard, Peter",
  "Maimonides, Moses",
  "Erasmus, Desiderius",
  "Machiavelli, Niccolò",
  "More, Thomas, Saint",
  "Montaigne, Michel de",
  "Bruno, Giordano",
  // the collection's utopias were More and Bacon, i.e. two Englishmen.
  // Campanella's City of the Sun is the third in that trio and the only one
  // written in prison by a convicted heretic — the same year and the same
  // Inquisition as Bruno.
  "Campanella, Tommaso",
  "Bacon, Francis, 1561",
  "Pascal, Blaise",
  "Hobbes, Thomas, 1588",
  "Descartes, René",
  "Spinoza, Benedictus de",
  "Locke, John, 1632",
  "Leibniz, Gottfried Wilhelm",
  "Berkeley, George, 1685",
  // The missing link between Hobbes and Adam Smith. The collection has
  // self-interest as a premise in the one and as a market in the other, but
  // not the thesis that connected them — that private vices yield public
  // benefits. Smith wrote against Mandeville, not into a vacuum. `A Letter
  // to Dion` is caught by JUNK_TITLE (`letter to`), and rightly so: it's a
  // reply to Berkeley, not a work.
  "Mandeville, Bernard",
  "Hume, David, 1711",
  "Rousseau, Jean-Jacques",
  "Voltaire, 1694",
  "Diderot, Denis",
  "Holbach, Paul Henri Thiry",
  // La Mettrie posed the mechanism question before Holbach and Diderot
  // carried it forward: `Man a Machine` (1747) argues that man, just like
  // the animals in Descartes, is matter in motion and nothing more. Without
  // him the collection has the mechanistic conclusion in Holbach but not
  // the argument that reached it.
  "La Mettrie, Julien Offray de, 1709-1751",
  "Condorcet, Jean-Antoine-Nicolas",
  "Lessing, Gotthold Ephraim",
  "Kant, Immanuel",
  "Wollstonecraft, Mary, 1759",
  "Godwin, William, 1756",
  "Hegel, Georg Wilhelm",
  // The link between Hegel and Marx. Without Feuerbach, the critique of
  // religion in the collection only begins with Marx, who built on him.
  "Feuerbach, Ludwig",
  "Schopenhauer, Arthur",
  "Kierkegaard, Søren",
  "Stirner, Max",
  "Mill, John Stuart",
  "Nietzsche, Friedrich Wilhelm",
  "Carlyle, Thomas, 1795",
  "Newman, John Henry",
  "Arnold, Matthew",
  "Ruskin, John, 1819",
  "Pater, Walter",
  "Green, Thomas Hill",
  // Utilitarianism ended in the collection with Mill. Sidgwick is the one
  // who spelled it out as a system and found the contradiction at its core
  // — "the dualism of practical reason" — and Moore's `Principia Ethica` is
  // the attack that ended the whole tradition and started the analytic one.
  // Two names, a hundred years of ethics that would otherwise be missing.
  "Sidgwick, Henry, 1838",
  "Moore, G. E.",
  "James, William, 1842",
  "Peirce, Charles S.",
  "Dewey, John, 1859",
  "Bergson, Henri",
  "Santayana, George",
  "Russell, Bertrand, 1872",
  "Whitehead, Alfred North",
  "Mach, Ernst",
  "Poincaré, Henri",
  "Kropotkin, Petr",
  // "Butler, Joseph" alone is also a prefix of "Butler, Josephine Elizabeth
  // Grey" — the year tells them apart.
  "Butler, Joseph, 1692",
  // Philosophy of science only existed as practice. The corpus had
  // Galileo, Newton, and Darwin but no one who spelled out how they knew
  // what they knew: Whewell coined "scientist", wrote the history of
  // induction, and `Novum organon renovatum`, which Mill replied to in
  // `A System of Logic`. He's listed under philosophy rather than science
  // because the genre carries through to reranking, and the question his
  // texts answer is epistemological — not "what is nature" but "how do we
  // know it".
  "Whewell, William",
  // Boole was listed here and had to be removed again: logic still jumps
  // straight from Aristotle to Russell. His three entries at Gutenberg —
  // `The Laws of Thought`, `The Mathematical Analysis of Logic`,
  // `The calculus of logic` — exist only as TeX and PDF, and `pg{id}.txt`
  // returns 404 for all three. The fetcher can't read them, so the line
  // would have produced three aborted works and no text.
  // British idealism ended in the corpus with Green, who died before he
  // spelled it out. Bosanquet is the one who did — the theory of the state
  // and the logic — and thereby also the target Moore's `Principia Ethica`
  // and Russell took aim at.
  "Bosanquet, Bernard",
  // Two language areas that were entirely absent. Croce is Italian
  // idealism and aesthetics, and `The Philosophy of Giambattista Vico` is
  // also the corpus's only English route to Vico, who otherwise exists
  // only in French. Unamuno is the whole Spanish tradition: `Tragic Sense
  // Of Life` is the corpus's only existentialist text between Kierkegaard
  // and nothing.
  "Croce, Benedetto",
  "Unamuno, Miguel de",
];

const POLITIK = [
  "Grotius, Hugo",
  "Smith, Adam, 1723",
  "Burke, Edmund, 1729",
  "Paine, Thomas, 1737",
  "Malthus, T. R.",
  "Ricardo, David",
  "Bentham, Jeremy",
  "Comte, Auguste",
  "Tocqueville, Alexis de",
  "Emerson, Ralph Waldo",
  "Thoreau, Henry David",
  "Mill, Harriet Hardy Taylor",
  "Marx, Karl, 1818",
  "Engels, Friedrich",
  "Proudhon, P.-J.",
  "Bakunin, Mikhail",
  "Spencer, Herbert, 1820",
  "Veblen, Thorstein",
  "Luxemburg, Rosa",
  /*
   * The American founding existed only as Paine, i.e. as the pamphlet
   * against England and not as the constitution that followed it.
   *
   * John Jay was listed here and had to be removed again: `The Federalist`
   * is ONE file at Gutenberg (18) with all three as authors, it goes to
   * Hamilton who's listed first, and Jay's only other entry is the same
   * file in a different edition. Madison, however, stays — he carries the
   * convention notes, which no one else has.
   *
   * Douglass and Fuller are here for the same reason Wollstonecraft is
   * under philosophy: slavery and the woman question are the American
   * republic's objection to itself, and without them the collection
   * answers "freedom" with only the founders.
   */
  "Hamilton, Alexander, 1757",
  "Madison, James, 1751",
  "Jefferson, Thomas",
  "Franklin, Benjamin, 1706",
  "Adams, John, 1735",
  "Douglass, Frederick",
  "Fuller, Margaret, 1810",
  // Law as a system. Blackstone is the only account of common law in the
  // collection, and the one Bentham wrote `A Fragment on Government`
  // against — Bentham is already in the list and, until now, had no one to
  // answer.
  "Blackstone, William, Sir",
  // Political economy ended with Ricardo and Marx. George is the 19th
  // century's most widely read economic polemic, and Keynes the text that
  // settled scores with Versailles before the 1930s proved him right;
  // d. 1946, so public domain since 2017.
  "George, Henry, 1839",
  "Keynes, John Maynard",
  // 19th-century Russian radicalism in a firsthand source. The collection
  // has Bakunin and Kropotkin but no one who describes the milieu they
  // came from.
  "Herzen, Aleksandr",
];

const VETENSKAP = [
  "Galilei, Galileo",
  "Newton, Isaac, 1642",
  "Faraday, Michael",
  // Lyell is the precondition for Darwin: deep geological time before
  // natural selection. Wallace formulated natural selection at the same
  // time and independently.
  "Lyell, Charles",
  "Darwin, Charles, 1809",
  "Huxley, Thomas Henry",
  "Wallace, Alfred Russel",
  "Freud, Sigmund, 1856",
  // Sexology as an empirical science, contemporary with and independent of
  // Freud. `Studies in the Psychology of Sex` exists at Gutenberg as six
  // volumes, and they count as volumes of one work — not as six works.
  // Ellis d. 1939, public domain since 2010.
  "Ellis, Havelock",
  // Maxwell and Helmholtz are 19th-century physics, which the collection
  // had through Faraday alone. Both have popular lectures at Gutenberg —
  // i.e. text written to explain, not equations.
  "Maxwell, James Clerk",
  "Helmholtz, Hermann von",
  // Computing as its own science didn't exist in the collection at all.
  // Babbage is the inventor of the analytical engine, and `Passages from
  // the Life of a Philosopher` describes the mechanical turn that got him
  // there — not just the result.
  "Babbage, Charles, 1791-1871",
];

/**
 * The historians. Questions about civilization, barbarism, decadence, and
 * downfall are rarely answered by a treatise — they're answered by Tacitus
 * describing the Germanic tribes, Gibbon explaining Rome's fall, and
 * Prescott depicting the conquest of Mexico.
 */
const HISTORIA = [
  "Herodotus",
  "Thucydides",
  "Xenophon",
  "Polybius",
  "Sallust",
  "Livy",
  "Caesar, Julius",
  "Tacitus, Cornelius",
  "Plutarch",
  "Suetonius",
  "Josephus, Flavius",
  "Ammianus Marcellinus",
  "Procopius",
  "Bede, the Venerable",
  "Froissart, Jean",
  "Ferguson, Adam",
  "Gibbon, Edward",
  "Prescott, William Hickling",
  "Macaulay, Thomas Babington",
  "Michelet, Jules",
  "Grote, George",
  "Motley, John Lothrop",
  "Guizot, François",
  "Buckle, Henry Thomas",
  "Fustel de Coulanges",
  "Maine, Henry Sumner",
  "Mommsen, Theodor",
  "Renan, Ernest",
  "Burckhardt, Jacob",
  "Draper, John William, 1811",
  "Lecky, William Edward Hartpole",
  "Green, John Richard",
  "Freeman, Edward A.",
  "Symonds, John Addington",
  "Bury, J. B.",
  "Vasari, Giorgio",
  "Ranke, Leopold von",
  // Distinguish from "Burckhardt, John Lewis", the traveler in Nubia.
  "Burckhardt, Jacob",
  // Distinguish from "Acton, Harold", the 20th-century author.
  "Acton, John Emerich",
  "Froude, James Anthony",
  /*
   * Two gaps, both in time and not in subject matter.
   *
   * Antiquity ended as narrative at Tacitus and Suetonius: Alexander, the
   * Hellenistic world, and the imperial era after Domitian existed in the
   * collection only as secondhand judgments in Gibbon. Arrian is the only
   * surviving continuous history of Alexander, Diodorus the only universal
   * history, Cassius Dio the only one writing the imperial era from inside
   * the senate.
   *
   * Then a six-hundred-year gap: Bede died in 735 and Froissart was born
   * in 1337, and between them the collection had no chronicler at all.
   * Einhard writes Charlemagne, Villehardouin the Fourth Crusade as a
   * participant, Malmesbury Norman England, Polo the China Europe didn't
   * believe in. Those are exactly the centuries a question about the
   * Middle Ages concerns.
   */
  "Arrian",
  // Diodorus was listed here and had to be removed again. His only catalog
  // entry is 37696, which is exactly the Thomas Taylor anthology already
  // in DENY_IDS because it lists Tacitus as the author of text he didn't
  // write. The universal history therefore doesn't exist at Gutenberg —
  // the gap is real, not a filtering error.
  "Cassius Dio Cocceianus",
  "Einhard",
  "Villehardouin, Geoffroi de",
  "William, of Malmesbury",
  "Polo, Marco",
  // American historiography's own self-examination. `The Education of
  // Henry Adams` and `Mont-Saint-Michel and Chartres` are a pair: the same
  // question about unity and multiplicity asked of the 13th century and of
  // the 20th.
  "Adams, Henry, 1838",
  /*
   * Huizinga (d. 1945, public domain since 2016) is listed under history
   * and not essay, even though *Homo ludens* is the work he's known for.
   * The reason is what Gutenberg actually has: a single entry, *Erasmus
   * and the Age of Reformation*, i.e. a biography of an author the
   * collection already carries eleven works by. The genre labels what's
   * actually indexed, as with Eliot and Lewis under poetry.
   */
  "Huizinga, Johan",
];

/**
 * Theory of civilization and ethnography. This is where the
 * savagery–barbarism–civilization distinction is actually formulated as
 * theory (Morgan, Tylor), and where it's questioned (Boas). Without them
 * the collection answers "civilization versus barbarism" with only echoes.
 */
const ANTROPOLOGI = [
  "Morgan, Lewis Henry",
  "Tylor, Edward B.",
  "Frazer, James George",
  "Boas, Franz, 1858",
  "Sumner, William Graham",
  "Westermarck, Edward",
  "Durkheim, Émile",
  "Bagehot, Walter",
  "Hobhouse, L. T.",
  "Le Bon, Gustave",
  "Gobineau, Arthur",
  /*
   * Anthropology was the collection's thinnest genre — eleven names and
   * thirty-five works against philosophy's four hundred — and thin in a
   * way that shows in the answers: it had the theorists who wrote about
   * people they never met, and almost no one who'd been there.
   *
   * Lang is Frazer's declared opponent and the only one in the list who
   * attacks `The Golden Bough` from within the same material; without him
   * the collection answers a question about myth and ritual with a single
   * school. Malinowski is the break from both of them —
   * `Argonauts of the Western Pacific` is fieldwork as method, and that
   * book is the reason armchair anthropology ended. Rivers and Cushing are
   * the same shift in practice: kinship terminology from the Todas, the
   * Zuñi from the inside.
   *
   * Marett has only a single primary entry at Gutenberg, and it's
   * included anyway: preanimism is Tylor's direct counterpart, and one
   * work on mana is more than zero.
   *
   * Wundt, Cooley, and McDougall are the boundary with social psychology.
   * That boundary is already drawn here rather than in philosophy —
   * Durkheim, Le Bon, and Sumner are listed above — so
   * `Elements of Folk Psychology` and `The Group Mind` belong on the same
   * line.
   */
  "Lang, Andrew",
  "Malinowski, Bronislaw",
  "Rivers, W. H. R.",
  "Marett, R. R.",
  "Haddon, Alfred C.",
  "Cushing, Frank Hamilton",
  "Hartland, Edwin Sidney",
  "Sapir, Edward",
  "Wundt, Wilhelm",
  "Cooley, Charles Horton",
  "McDougall, William",
];

const DRAMA = [
  "Aeschylus",
  "Sophocles",
  "Euripides",
  "Aristophanes",
  "Plautus, Titus Maccius",
  "Terence",
  "Marlowe, Christopher",
  "Shakespeare, William",
  "Jonson, Ben",
  "Webster, John, 1580",
  "Calderón de la Barca, Pedro",
  "Corneille, Pierre",
  "Molière",
  "Racine, Jean",
  "Goethe, Johann Wolfgang von",
  "Schiller, Friedrich",
  "Ibsen, Henrik",
  "Strindberg, August",
  "Chekhov, Anton",
  "Wilde, Oscar",
  "Shaw, Bernard",
  "Synge, J. M.",
  "Maeterlinck, Maurice",
  // The word "robot" was coined in this play (1920). R.U.R. poses the
  // question Erewhon's Butler chapter only hinted at — manufactured
  // thinking beings that rebel against their creators — as drama rather
  // than essay, a generation before Turing turned it into science.
  "Čapek, Karel, 1890-1938",
];

const DIKT = [
  "Homer",
  "Hesiod",
  "Virgil",
  "Horace",
  "Ovid",
  "Juvenal",
  "Dante Alighieri",
  "Chaucer, Geoffrey",
  "Spenser, Edmund",
  "Milton, John",
  "Pope, Alexander",
  "Blake, William",
  "Wordsworth, William",
  "Coleridge, Samuel Taylor",
  "Byron, George Gordon",
  "Shelley, Percy Bysshe",
  "Keats, John",
  "Tennyson, Alfred",
  "Browning, Robert",
  "Whitman, Walt",
  // See the comment in PROSA. Baudelaire was missing from a collection
  // that already had Whitman; Pushkin from one that had Gogol and Turgenev.
  "Baudelaire, Charles, 1821",
  "Pushkin, Aleksandr Sergeevich, 1799",
  "Heine, Heinrich, 1797",
  "Rilke, Rainer Maria, 1875",
  "Novalis, 1772",
  "Langland, William",
  "Dickinson, Emily",
  /*
   * THE TWO BELOW REST ON GUTENBERG'S OWN RIGHTS ASSESSMENT AND NOT ON
   * LIFE-PLUS-SEVENTY, and that needs to be spelled out because otherwise
   * the line looks like any other. Eliot died 1965 and Lewis 1963; in
   * Sweden they're protected until 2036 and 2034 respectively. Gutenberg
   * has them anyway, because their early works are public domain in the
   * US — Prufrock 1917, Spirits in Bondage 1919, The Waste Land 1922 — and
   * that's the same basis the collection already stands on for Russell
   * (d. 1970), Moore (1958), Mann (1955), Woolf, and Joyce (1941). The
   * only difference from those lines is that no one wrote it down. The
   * choice belongs to the commissioner and was made deliberately; if you
   * change your mind, these two lines and the five named above must go
   * together, not just one half.
   *
   * Both are listed under poetry even though neither is primarily a poet,
   * and that's not an oversight: the genre labels what's *actually
   * indexed*, and what's free at Gutenberg is the poetry. Lewis's
   * apologetics and Eliot's later essays are protected and will never be
   * included. Putting Lewis under religion when the collection carries
   * two verse books by him would be lying to the reranker.
   */
  "Eliot, T. S. (Thomas Stearns), 1888",
  "Lewis, C. S. (Clive Staples), 1898",
  /*
   * Greek lyric poetry was entirely absent. The collection had epic and
   * drama but not the chorus and not love poetry — Pindar and Sappho are
   * that whole tradition, and the one Horace writes in relation to.
   *
   * Petrarch is the single largest gap in the entire poetry genre: the
   * sonnet is Europe's most copied verse form for five hundred years, and
   * the collection went straight from Dante to Shakespeare's sonnets with
   * no link between them. Tasso and Camões close out the Renaissance epic
   * after Ariosto — Camões is also the collection's only Portuguese
   * author, in any language.
   *
   * Snorri is the same kind of gap but for Old Norse: the Prose Edda is
   * the surviving source for Norse mythology and Heimskringla its sagas of
   * kings. For an app whose questions are asked in Swedish, this absence
   * was harder to defend than the others.
   *
   * Yeats, Swinburne, Hopkins, Rossetti, and Verlaine are the second half
   * of the 19th century, where the collection stopped at Browning and
   * Tennyson. Yeats d. 1939, public domain since 2010; the other four died
   * before 1910.
   */
  "Pindar",
  "Sappho",
  "Petrarca, Francesco",
  "Tasso, Torquato",
  "Camões, Luís de",
  "Snorri Sturluson",
  "Swinburne, Algernon Charles",
  "Rossetti, Christina Georgina",
  "Hopkins, Gerard Manley",
  "Verlaine, Paul",
  "Yeats, W. B.",
  /*
   * Dryden and Vaughan are the gap between Milton and Pope. Dryden is the
   * Restoration's full register of verse — satire, heroic drama, odes —
   * and the one Pope writes in relation to; Vaughan is the last link of
   * metaphysical poetry after Donne, whom the collection already has.
   * Without them poetry jumps from 1667 to 1711 with no link in between,
   * and 17th-century English verse otherwise exists only as TCP's printed
   * texts.
   */
  "Dryden, John, 1631",
  "Vaughan, Henry, 1621",
];

const PROSA = [
  "Cervantes Saavedra, Miguel de",
  "Defoe, Daniel",
  "Swift, Jonathan",
  "Sterne, Laurence",
  "Austen, Jane",
  "Shelley, Mary Wollstonecraft",
  "Hugo, Victor",
  "Balzac, Honoré de",
  "Hawthorne, Nathaniel",
  "Gogol, Nikolai",
  "Dickens, Charles",
  "Melville, Herman",
  "Flaubert, Gustave",
  "Turgenev, Ivan",
  "Eliot, George",
  "Dostoyevsky, Fyodor",
  "Tolstoy, Leo",
  "Twain, Mark",
  "Zola, Émile",
  "Hardy, Thomas",
  "James, Henry",
  "Stevenson, Robert Louis",
  "Conrad, Joseph",
  "Kipling, Rudyard",
  "Wells, H. G.",
  "Chesterton, G. K.",
  // Added afterward: they weren't in any list despite Gutenberg having
  // them, and a canon with Hawthorne and Whitman but without Poe is an
  // oversight, not a selection. The Brothers Grimm's tales belong here
  // just as much as Kipling's.
  "Poe, Edgar Allan, 1809",
  "Brontë, Charlotte, 1816",
  "Brontë, Emily, 1818",
  "Brontë, Anne, 1820",
  "Kafka, Franz, 1883",
  "Proust, Marcel, 1871",
  "Mann, Thomas, 1875",
  "Woolf, Virginia, 1882",
  "Joyce, James, 1882",
  "Malory, Thomas",
  // Distinguish from "Richardson, James D.", who is an editor, not a novelist.
  "Richardson, Samuel",
  "Fielding, Henry",
  "Smollett, T. (Tobias)",
  /*
   * Prose is already the collection's second-largest genre, and the cap of
   * six exists specifically to stop this list from swelling. The bar for
   * inclusion below is therefore stricter than "canonical": every name has
   * to carry a form, a language, or a century that isn't present in the
   * collection at all. Meredith, Trollope, Gaskell, and Wilkie Collins met
   * the canon bar but not this one — the Victorian English novel already
   * has Dickens, Eliot, Hardy, and three Brontë sisters.
   *
   * The forms that were missing: Petronius is the Roman novel, Rabelais
   * Renaissance prose, Cellini the artist's autobiography as a
   * counterpart to Vasari, Scott the historical novel as a genre,
   * Maupassant the short story, Butler the satirical utopia after More
   * and Bacon, Grimm and Andersen the literary fairy tale — the former
   * promised in the comment above but never added.
   *
   * The languages that were missing: Polish (Sienkiewicz), Spanish prose
   * after Cervantes (Pérez Galdós), Dutch (Multatuli), Danish and
   * Norwegian prose — the collection had Kierkegaard and Brandes but no
   * Danish novel, and Ibsen only as drama — and Italian prose after
   * Manzoni (Verga).
   *
   * The century that was missing: the 1900–1940 novel existed as Joyce,
   * Woolf, Mann, Proust, and Kafka, i.e. as modernism's core and nothing
   * around it. All five below died before 1953 and are public domain
   * under life-plus-seventy: Lawrence 1930, Wharton 1937, Cather 1947,
   * Gorky 1936, Hamsun 1952.
   *
   * Thackeray and Lermontov/Goncharov are exceptions to the strictness and
   * are included as oversights of the same kind as Poe above: four of the
   * 19th century's five great Russians were present but not the two that
   * close out the line, and an English 19th-century list without
   * `Vanity Fair` is not a selection.
   */
  "Petronius Arbiter",
  "Rabelais, François",
  "Cellini, Benvenuto",
  "Christine, de Pisan",
  "Scott, Walter, 1771",
  "Thackeray, William Makepeace",
  "Maupassant, Guy de",
  "Butler, Samuel, 1835",
  "Grimm, Jacob",
  "Andersen, H. C.",
  "Lermontov, Mikhail Iurevich",
  "Goncharov, Ivan Aleksandrovich",
  "Sienkiewicz, Henryk",
  "Pérez Galdós, Benito",
  "Multatuli",
  "Jacobsen, J. P.",
  "Bjørnson, Bjørnstjerne",
  "Verga, Giovanni",
  "Lawrence, D. H.",
  "Wharton, Edith",
  "Cather, Willa",
  "Gorky, Maksim",
  "Hamsun, Knut",
  /*
   * Gaskell and Morris are two gaps in 19th-century English prose that no
   * other line covers. *Mary Barton* and *North and South* are the
   * industrial city novel, i.e. what Dickens depicts and Engels describes
   * — the collection had both of the others but not this one. Morris is
   * the opposite: *News from Nowhere* is the utopia, and it belongs next
   * to More and Campanella, not next to Dickens.
   *
   * Prose's cap is six and Morris has 28 entries, almost all romances in
   * mock-medieval English. If News from Nowhere doesn't end up one of the
   * six, PRIORITY_IDS is what should carry it, just as with Scott.
   */
  "Gaskell, Elizabeth Cleghorn",
  "Morris, William, 1834",
];

const RELIGION = [
  "Confucius",
  "Laozi",
  "Zhuangzi",
  "Mencius",
  "Thomas, à Kempis",
  "Luther, Martin",
  "Calvin, Jean",
  "Teresa, of Avila",
  "Bunyan, John",
  "Edwards, Jonathan",
  "Swedenborg, Emanuel",
  "Wesley, John",
  /*
   * Patristics was a two-hundred-year gap: the collection went straight
   * from the New Testament to Augustine, skipping the entire period when
   * Christianity formulated itself against Greek philosophy. Two of the
   * three names that could fill it are at Gutenberg, and that's all there
   * is: Tertullian, Irenaeus, Clement, and Athanasius have no English
   * entries in the catalog — they're held by the Christian Classics
   * Ethereal Library, which isn't one of the collection's sources. So the
   * gap is smaller, not filled in.
   */
  "Origen",
  "John Chrysostom, Saint",
];

const ESSA = [
  "Longinus",
  "Lucian, of Samosata",
  "Addison, Joseph",
  "Johnson, Samuel, 1709",
  "Lamb, Charles",
  "Hazlitt, William, 1778",
  "De Quincey, Thomas",
  "Sainte-Beuve",
  "Taine, Hippolyte",
  "Brandes, Georg",
  /*
   * The genre consisted of three French and one Danish critic plus four
   * Englishmen, and thereby had the 18th-century and Romantic essay but
   * not the main line of the English essay after Hazlitt.
   *
   * Holmes, Lowell, and Stephen are the Victorian middle: the breakfast
   * table, `Among My Books`, `Hours in a Library`. Landor and Amiel are
   * the two forms the genre otherwise lacks entirely — the imaginary
   * dialogue and the diary.
   *
   * Richard Steele was listed here and had to be removed again, and the
   * reason is worth keeping: at Gutenberg the Tatler and Spectator volumes
   * are co-authored with Addison, who's earlier in the list and therefore
   * claims them first. What's left for Steele is `Isaac Bickerstaff` and
   * `The Spectator, Volumes 1, 2 and 3` — and the latter is the same text
   * as Addison's volumes 1 and 2 all over again. PRIORITY_IDS doesn't fix
   * it: the cap is global, so putting the Tatler volumes ahead of Addison
   * would just move the loss to the Spectator.
   *
   * Repplier is the list's first woman, and that was an oversight, not a
   * selection: twelve essay collections at Gutenberg, all public domain.
   *
   * Belloc (d. 1953) and Repplier (d. 1950) are public domain in Sweden
   * since 2024 and 2021 respectively — life-plus-seventy, no Gutenberg
   * assessment involved. Saintsbury (d. 1933) and Gosse (d. 1928) likewise.
   */
  "Landor, Walter Savage",
  "Holmes, Oliver Wendell, 1809",
  "Lowell, James Russell",
  "Stephen, Leslie",
  "Saintsbury, George",
  "Amiel",
  "Hearn, Lafcadio",
  "Gosse, Edmund",
  "Belloc, Hilaire",
  "Repplier, Agnes",
  /*
   * The genre began with Longinus and Lucian and then jumped to Addison,
   * i.e. over everything between the year 200 and 1700 except Montaigne,
   * who's under philosophy. Theophrastus's `Characters` is the original
   * form of the character sketch and the book both La Bruyère and Addison
   * write in relation to. Sidney's `Defence of Poesie` is the first
   * English poetics, Walton's `Compleat Angler` the conversation book, and
   * Goldsmith's `Citizen of the World` the fictional
   * letters-from-a-stranger form — the same form as Montesquieu's Persian
   * Letters, which the collection has in French but not represented as a
   * genre in its own right.
   */
  "Theophrastus",
  "Sidney, Philip",
  "Walton, Izaak",
  "Goldsmith, Oliver",
  /*
   * ART THEORY AS ITS OWN LINE, and this is the only group added here for
   * a subject-matter reason rather than a gap-filling one.
   *
   * The collection had art scattered across four genres with no line
   * saying it was a line of its own: Vasari under history, Cellini under
   * prose, Ruskin and Pater under philosophy, Vitruvius under science at
   * Perseus, Winckelmann in German at DTA — and Leonardo under science in
   * this file, because the notebooks are mostly anatomy, optics, and
   * mechanics. But they also carry the theory of perspective and the
   * sections on painting, i.e. what made someone ask for him in the first
   * place, and the four below close the chain from Leonardo's own theory
   * of painting through the Renaissance courtly ideal to the academy's
   * lectures. Leonardo was already in the catalog; Castiglione, Reynolds,
   * and Winckelmann's English text were entirely absent.
   *
   * Winckelmann already appears in the DTA section with *Geschichte der
   * Kunst des Alterthums* in German, and `essay` is the genre he has there
   * — the line here gives the same author his English *Reflections on the
   * Painting and Sculpture of the Greeks*, not a second genre.
   *
   * THAT ART ISN'T A GENRE is the real gap, and it isn't solved by an
   * author list. `Genre` has ten values and none of them is art; adding an
   * eleventh is a change to taxonomy.ts, i18n.ts in both languages, and
   * available.ts, i.e. its own piece of work. Until then, essay is the
   * closest label available for someone who writes *about* art.
   */
  "Leonardo, da Vinci, 1452",
  "Castiglione, Baldassarre",
  "Reynolds, Joshua, Sir, 1723",
  "Winckelmann, Johann Joachim",
];

/**
 * The caps are generous on purpose. A low cap forces a ranking, and the
 * only one we have is ascending Gutenberg ID — which is not the same
 * thing as importance. With a cap of 14, Plato kept *Ion* and *Lysis* but
 * lost *Phaedo*, *Gorgias*, and *The Laws*. Better to include everything
 * that clears the filters.
 *
 * Fiction has a lower cap than the treatises: Balzac and Dickens each have
 * over a hundred titles at Gutenberg, and a collection where they
 * dominate answers a philosophical question worse than one where they're
 * merely present.
 */
const GROUPS: {
  authors: string[];
  cap: number;
  label: string;
  genre: Genre;
}[] = [
  { authors: FILOSOFI, cap: 25, label: "filosofi", genre: "filosofi" },
  { authors: POLITIK, cap: 12, label: "politisk teori", genre: "politik" },
  { authors: VETENSKAP, cap: 8, label: "vetenskap", genre: "vetenskap" },
  { authors: HISTORIA, cap: 12, label: "historia", genre: "historia" },
  { authors: ANTROPOLOGI, cap: 8, label: "antropologi", genre: "antropologi" },
  { authors: DRAMA, cap: 12, label: "drama", genre: "drama" },
  { authors: DIKT, cap: 8, label: "dikt & epos", genre: "dikt" },
  { authors: PROSA, cap: 6, label: "prosa", genre: "prosa" },
  { authors: RELIGION, cap: 6, label: "religion", genre: "religion" },
  { authors: ESSA, cap: 6, label: "essä", genre: "essä" },
];

/**
 * Works with no named author in the catalog — epics, folk tales, and
 * sacred texts. They can't be picked up via the author lists above (the
 * entry is under the translator, or empty), so they're specified by
 * Gutenberg ID. The author field gets the work's own traditional name:
 * that's the only grouping that means anything in the interface.
 *
 * `year` is a rough dating of the text, not of the translation.
 */
const EXTRA: {
  gutenbergId: number;
  author: string;
  title: string;
  year: number;
  genre: Genre;
  /** Substring from Gutenberg's own title line — the same check as for other works. */
  titleMatch: string;
}[] = [
  {
    gutenbergId: 11000,
    author: "Gilgamesheposet",
    title: "An Old Babylonian Version of the Gilgamesh Epic",
    year: -1800,
    genre: "dikt",
    titleMatch: "gilgamesh",
  },
  {
    gutenbergId: 3283,
    author: "Upanishaderna",
    title: "The Upanishads",
    year: -600,
    genre: "religion",
    titleMatch: "upanishad",
  },
  {
    gutenbergId: 2017,
    author: "Dhammapada",
    title: "Dhammapada, a Collection of Verses",
    year: -300,
    genre: "religion",
    titleMatch: "dhammapada",
  },
  {
    gutenbergId: 2388,
    author: "Bhagavadgita",
    title: "The Song Celestial; Or, Bhagavad-Gîtâ",
    year: -200,
    genre: "religion",
    titleMatch: "song celestial",
  },
  {
    gutenbergId: 15474,
    author: "Mahabharata",
    title: "The Mahabharata, Books 1–3",
    year: -300,
    genre: "dikt",
    titleMatch: "mahabharata",
  },
  {
    gutenbergId: 10,
    author: "Bibeln",
    title: "The King James Version of the Bible",
    year: 100,
    genre: "religion",
    titleMatch: "king james",
  },
  {
    gutenbergId: 2800,
    author: "Koranen",
    title: "The Koran (Al-Qur'an)",
    year: 650,
    genre: "religion",
    titleMatch: "koran",
  },
  {
    gutenbergId: 981,
    author: "Beowulf",
    title: "Beowulf",
    year: 900,
    genre: "dikt",
    titleMatch: "beowulf",
  },
  {
    gutenbergId: 391,
    author: "Rolandssången",
    title: "The Song of Roland",
    year: 1100,
    genre: "dikt",
    titleMatch: "song of roland",
  },
  {
    gutenbergId: 1151,
    author: "Nibelungenlied",
    title: "The Nibelungenlied",
    year: 1200,
    genre: "dikt",
    titleMatch: "nibelungenlied",
  },
  {
    gutenbergId: 5186,
    author: "Kalevala",
    title: "Kalevala: the Epic Poem of Finland",
    year: 1849,
    genre: "dikt",
    titleMatch: "kalevala",
  },
  // Deliberate exception to EXTRA's own rule above — this work DOES have
  // a named author in the catalog (Menabrea), but it's the translator who
  // makes the text an AI-history source. Lovelace's "Note G" is longer
  // than the memoir itself and contains the first formulation of the
  // objection to machine thought that Turing named "Lady Lovelace's
  // Objection" against in 1950. Listing her as author instead of Menabrea
  // is a deliberate choice, not a missed role marker.
  {
    gutenbergId: 75107,
    author: "Ada Lovelace",
    title: "Sketch of the Analytical Engine Invented by Charles Babbage",
    year: 1843,
    genre: "vetenskap",
    titleMatch: "sketch of the analytical engine",
  },
];

/**
 * Titles that aren't works: indexes, collected-works volumes that
 * duplicate the individual writings, biographies and letter collections
 * about the author rather than by them, and children's adaptations
 * ("Stories from Thucydides").
 *
 * `vol. N of` requires that what follows is NOT a number. "Vol. 1 of The
 * Works of Burke" is a collected-works volume and should be excluded;
 * "Vol. 1 of 3" is volume one of a single work — and for the historians
 * that's the only form that exists. Gibbon's *Decline and Fall* and
 * Buckle's *History of Civilization in England* only exist as volumes.
 */
const JUNK_TITLE =
  /\b(index|complete works|the works of|works of \w+ in|in (two|three|four|five|six|ten|twelve) volumes|vol\.? ?\d+ of (?!\d)|volume \d+ of (?!\d)|master-?piece|life (of|and letters)|memoirs?\b|biograph|letters? (of|to|written)|selections? from|posthumous|dictionary|encyclopa?edia|bibliograph|an appreciation|a study of (the |his )?(life|works?|writings|genius|character)|reminiscence|autobiograph|table[- ]talk|anecdotes|for (young people|boys|children)|stor(y|ies) (from|of) |adventures of ulysses)/i;

/**
 * Tested against the FULL catalog title, subtitle included — that's where
 * the signal lives for files that aren't text at all: tables of contents
 * with links, indexes, and children's adaptations.
 *
 * Running the full `JUNK_TITLE` against the subtitle would be too strict:
 * Gutenberg's Nietzsche carries the subtitle "Complete Works, Volume
 * Thirteen" on the *Genealogy of Morals*, and `complete works` would then
 * discard one of the collection's most important texts.
 */
const JUNK_SUBTITLE =
  /\b(table of contents|a linked index|index to the project gutenberg|told to the children|in words of one syllable|adapted (for|from)|retold)/i;

/**
 * Works whose catalog entry points to the wrong author. 37696 lists
 * Tacitus among its authors but is an 18th-century compilation by Thomas
 * Taylor — it would end up under "Cornelius Tacitus" on the passage card
 * and lie outright.
 *
 * 9804 is here for a different reason: it's not the wrong author but an
 * excerpt that went out as a complete work. "Stones of Venice
 * [introductions]" is the 1877 traveler's edition — introductory chapters
 * and a local index for someone standing in Venice, 418 kB — and not the
 * three volumes. As long as it was the collection's only *Stones of
 * Venice*, it hid the fact that the work was missing: a search on
 * architecture and civilization would get an index of Venetian palaces
 * where *Nature of Gothic* should have stood. With 30754–30756 in, it's
 * both redundant and half the same text.
 */
// 54618 is Croce's `Aesthetic` (9306) all over again, with Æ in the title.
// The duplicate key misses the pair because it replaces every non-ASCII
// character with a space: "aesthetic" against " sthetic" is two keys, not
// one. Transliterating in `titleKey` instead would mean touching the
// duplicate-detection for the entire collection — one ID is cheaper.
const DENY_IDS = new Set([
  37696,
  9804,
  54618,
  // Grimm exists at Gutenberg as six nearly identical selections from the
  // same tale collection under five different titles, so the duplicate
  // key doesn't see them as the same book and the cap of six would have
  // filled up with nothing but Grimm in six editions. 2591 is the most
  // complete and is left standing alone; 59508 is already caught by
  // `index` in JUNK_TITLE.
  5314, 11027, 19068, 37381, 52521,
  // The Declaration of Independence exists at Gutenberg as three separate
  // files with three different titles. The duplicate key sees them as
  // three works; the text is identical, and it's short enough that three
  // copies would be noticeable in a results list.
  300, 16780,

  /*
   * Below are the seven works `.probe-header-match.ts` found: the catalog
   * lists an author the file's own header doesn't acknowledge. All seven
   * would have aborted ingest, and in every case the file is right — it's
   * the catalog's co-author field that's overly generous. The work stays
   * with whoever actually wrote it, and would otherwise have ended up
   * under the wrong name on the passage card.
   */
  14726, // "The Elder Eddas of Saemund Sigfusson" — the header says Sæmundur fróði.
  // Snorri is listed in the catalog for the Prose Edda in the same
  // volume; 18947 is the clean edition and stays
  40861, 41095, // The convention notes — the header says "United States.
  // Constitutional Convention". Madison kept the notes but isn't the
  // file's author
  62756, // "Margaret and Her Friends" — Caroline Dall's account of
  // Fuller's conversations, i.e. a book ABOUT her
  79404, // "The international crisis" — a symposium with Eleanor Sidgwick
  // as primary author, not Bosanquet
  3307, // "The Pagan Tribes of Borneo" — Charles Hose is listed first;
  // McDougall is second name and would have claimed the whole book
  10700, // "The History of England" vol. 8 — John Lingard's work, which
  // Belloc merely continued. Belloc's own essay collections stay

  /*
   * And below are the ones that don't exist as text. Gutenberg has them
   * only as TeX and PDF — `pg{id}.txt` returns 404 — so they can't be
   * fetched at all. Boole had three entries and all three are like this,
   * which is why he was removed from FILOSOFI again.
   */
  15114, 36884, 69512, // Boole
  32625, // Keynes, "A Treatise on Probability"
]);

const ALLOW_IDS = new Set([
  60333, // "Selections from the Writings of Kierkegaard" — the only Kierkegaard there is
  8120, // "The Life of St. Teresa of Jesus" — her own autobiography, not a biography about her

  // JUNK_TITLE looks for biographies ABOUT an author and in doing so also
  // catches works that happen to be titled that way. The exceptions below
  // are all major works by authors already in the lists — they were
  // silently missing from the collection until someone went looking for them.
  1260, // Brontë, "Jane Eyre: An Autobiography" — caught by `autobiograph`
  15000, // Santayana, "The Life of Reason" — his major work, caught by `life of`
  16581, // Renan, "The Life of Jesus" — his most widely read book, same rule
  4511, // Maeterlinck, "The Life of the Bee" — same rule
  10378, // Mill, "Autobiography"
  2010, // Darwin, "The Autobiography of Charles Darwin"
  1315, // Huxley, "Autobiography and Selected Essays"
  4028, // Cellini, "The Autobiography of Benvenuto Cellini" — his only work
  // besides the goldsmithing treatises, and the reason he's in the list at all
  6032, // Villehardouin, "Memoirs or Chronicle of the Fourth Crusade" —
  // caught by `memoirs`, which looks for memoirs ABOUT an author. Here the
  // chronicle is the work, and the only eyewitness account of a crusade
  // the collection can get
  148, // Franklin, "The Autobiography of Benjamin Franklin" — caught by
  // `autobiograph`. The other two editions (20203, 36151) are left
  // blocked: 20203 gets the same duplicate key anyway, and a third
  // edition of the same text adds nothing
  23, // Douglass, "Narrative of the Life of Frederick Douglass" — caught
  // by `life of`. The slave narrative is his work; `My Bondage and My
  // Freedom` is the revision
  57532, // Babbage, "Passages from the Life of a Philosopher" — caught by
  // `life of`. His own memoir and the only text where he himself tells
  // how he arrived at the analytical engine — not a biography about him

  // Lucian exists at Gutenberg only as "The Works of Lucian of Samosata",
  // four volumes — `the works of` in JUNK_TITLE caught all of them,
  // leaving two stray pamphlets. The rule looks for collected-works
  // volumes that duplicate individual works; here there are no individual
  // works to duplicate.
  6327,
  6585,
  6829,
  47242,
]);

interface CatalogRow {
  id: number;
  title: string;
  language: string;
  type: string;
  authors: string;
}

async function loadCatalog(): Promise<CatalogRow[]> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cached = path.join(CACHE_DIR, "pg_catalog.csv");

  if (!fs.existsSync(cached)) {
    process.stdout.write("Hämtar Gutenbergs katalog… ");
    const res = await fetch(CATALOG_URL, {
      headers: {
        "User-Agent": "canon-indexer/0.2 (personal research project)",
      },
    });
    if (!res.ok)
      throw new Error(`Katalogen svarade ${res.status} ${res.statusText}`);
    fs.writeFileSync(cached, await res.text(), "utf8");
    console.log("klart");
  }

  const rows = parseCsv(fs.readFileSync(cached, "utf8"));
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const [cId, cTitle, cLang, cType, cAuth] = [
    col("Text#"),
    col("Title"),
    col("Language"),
    col("Type"),
    col("Authors"),
  ];

  return rows
    .slice(1)
    .filter((r) => r.length > cAuth)
    .map((r) => ({
      id: Number(r[cId]),
      title: r[cTitle],
      language: r[cLang],
      type: r[cType],
      authors: r[cAuth],
    }))
    .filter(
      (r) => Number.isFinite(r.id) && r.language === "en" && r.type === "Text",
    );
}

/* ------------------------------------------------------------------ *
 * Metadata from the author field
 * ------------------------------------------------------------------ */

/**
 * The role marker can be multi-word — `[Author of introduction, etc.]`,
 * `[Dubious author]` — so the pattern has to capture everything inside the
 * brackets. A `\w+` pattern here let pseudo-Plato through as genuine Plato.
 */
const ROLE_RE = /\s*\[([^\]]+)\]\s*$/;

interface Attribution {
  primary: string[];
  translator: string | null;
  dubious: boolean;
}

function attribution(field: string): Attribution {
  const primary: string[] = [];
  let translator: string | null = null;
  let dubious = false;

  for (const raw of (field || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const m = ROLE_RE.exec(raw);
    if (!m) {
      primary.push(raw);
      continue;
    }
    const role = m[1].toLowerCase();
    const name = raw.replace(ROLE_RE, "");
    if (role === "translator") translator ??= name;
    // This is how Gutenberg marks pseudepigrapha. Four "Plato" works aren't Plato's.
    if (role.includes("dubious")) dubious = true;
  }
  return { primary, translator, dubious };
}

/** "Nietzsche, Friedrich Wilhelm, 1844-1900" → { name, death: 1900 } */
function lifespan(entry: string): { name: string; death: number | null } {
  const m = /,\s*(\d{1,4})\??\s*(BCE)?\s*-\s*(\d{1,4})\??\s*(BCE)?\s*$/.exec(
    entry,
  );
  if (!m) return { name: entry.replace(/,\s*$/, ""), death: null };
  const death = m[4] ? -Number(m[3]) : Number(m[3]);
  return { name: entry.slice(0, m.index), death };
}

/**
 * Names where the catalog's "Surname, Forename" form can't be mechanically
 * reversed. "Thomas, Aquinas, Saint" doesn't have surname Thomas — and the
 * name appears on every passage card in the interface, so it has to be right.
 */
const DISPLAY_OVERRIDES: [string, string][] = [
  ["Thomas, Aquinas", "Thomas av Aquino"],
  ["Thomas, à Kempis", "Thomas a Kempis"],
  ["Augustine, of Hippo", "Augustinus"],
  // The catalog form repeats the surname — "Acton, John Emerich Edward
  // Dalberg Acton, Baron" — and `displayName` would then put it in twice.
  ["Acton, John Emerich", "Lord Acton"],
  // An open-ended lifespan, "-1471", isn't a year `displayName` recognizes,
  // so it carries through into the name as "Thomas Malory, -1471".
  ["Malory, Thomas", "Thomas Malory"],
  ["Marcus Aurelius", "Marcus Aurelius"],
  ["Condorcet, Jean-Antoine-Nicolas", "Condorcet"],
  ["Holbach, Paul Henri Thiry", "Baron d'Holbach"],
  ["Kropotkin, Petr", "Pjotr Kropotkin"],
  ["Lucretius Carus, Titus", "Lucretius"],
  // Single-word forms: the catalog has no comma to reverse, so
  // `displayName` leaves them as they are. "Ghazzali" and "Averroës" are
  // transliterations, not surnames — and the name appears on every passage card.
  ["Ghazzali", "al-Ghazali"],
  ["Averroës", "Averroes"],
  // The spelled-out forename form would otherwise win over the initials
  // and produce "George Edward Moore". He's never cited that way.
  ["Moore, G. E.", "G. E. Moore"],
  ["Erasmus, Desiderius", "Erasmus av Rotterdam"],
  ["Bede, the Venerable", "Beda venerabilis"],
  ["Teresa, of Avila", "Teresa av Ávila"],
  ["Longinus", "Longinos"],
  // Medieval names are "Forename, of Place" rather than "Surname,
  // Forename", so reversing them gives "of Malmesbury William" and "de
  // Pisan Christine".
  ["William, of Malmesbury", "William av Malmesbury"],
  ["Christine, de Pisan", "Christine de Pizan"],
  // "John Chrysostom, Saint, -407" has an open-ended lifespan that
  // `displayName` doesn't recognize, so both the epithet and the year
  // carried through into the name.
  ["John Chrysostom, Saint", "Johannes Chrysostomos"],
  ["Porphyry", "Porfyrios"],
  ["Proclus", "Proklos"],
  ["Diogenes Laertius", "Diogenes Laertios"],
  // The catalog form "Lucian, of Samosata" isn't a surname-forename pair:
  // reversing it produces "of Samosata Lucian".
  ["Lucian, of Samosata", "Lucianus"],
  ["Gobineau, Arthur", "Arthur de Gobineau"],
  // The noble name appears twice in the catalog form ("Byron, George
  // Gordon Byron, Baron"), and reversing it then gives "George Gordon
  // Byron Byron".
  ["Byron, George Gordon", "Lord Byron"],
  ["Tennyson, Alfred Tennyson", "Alfred Tennyson"],
  ["Macaulay, Thomas Babington", "Thomas Babington Macaulay"],
  // Single-word and already-correct forms: without this, reversing would make them worse.
  ["Fustel de Coulanges", "Fustel de Coulanges"],
  ["Sainte-Beuve", "Sainte-Beuve"],
];

/**
 * Death year for authors whose catalog entry lacks a lifespan. Without
 * this, `year` becomes zero — which both sorts them first in the manifest
 * and displays as "0" on the passage card. The values are conventional
 * datings, not attested years.
 */
const YEAR_OVERRIDES = new Map<string, number>([
  ["Hesiod", -700],
  ["Polybius", -118],
  ["Terence", -159],
  ["Juvenal", 130],
  ["Procopius", 565],
  ["Laozi", -531],
  ["Zhuangzi", -286],
  ["Longinus", 273],
  ["Diogenes Laertius", 250],
  ["Sainte-Beuve", 1869],
  // The catalog writes Chrysostom as "John Chrysostom, Saint, -407", i.e.
  // death year with no birth year. `lifespan` reads the pair and gets
  // nothing, so the year came out as 0 and appeared as the date in the citation.
  ["John Chrysostom, Saint", 407],
]);

/** Noble titles and epithets that only clutter up an author's name. */
const HONORIFIC =
  /^(saint|st\.?|jr\.?|sir|dame|lord|lady|baron|baronne|freiherr( von)?|kniaz|marquis( de)?|comte( de)?|graf|von|de|d'|emperor of rome|of hippo|active .*|approximately .*)$/i;

/** "Cicero, Marcus Tullius" → "Marcus Tullius Cicero" */
function displayName(catalogName: string): string {
  for (const [key, name] of DISPLAY_OVERRIDES) {
    if (catalogName.startsWith(key)) return name;
  }

  const parts = catalogName
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length < 2) return parts[0] ?? catalogName;

  const [surname, forenameRaw, ...rest] = parts;
  // "Charles S. (Charles Sanders)" → "Charles Sanders": the spelled-out
  // form is nicer than the initials.
  const spelled = /\(([^)]+)\)/.exec(forenameRaw);
  const forename = spelled ? spelled[1] : forenameRaw;

  const epithets = rest.filter((r) => !/^\d/.test(r) && !HONORIFIC.test(r));
  const base = `${forename} ${surname}`.replace(/\s+/g, " ").trim();
  return epithets.length > 0 ? `${base}, ${epithets.join(", ")}` : base;
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Title without subtitle or line breaks — the catalog packs both in. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*\n[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The base title without part/volume number: "Ethics — Part 3",
 * "A Theological-Political Treatise [Part IV]", and "Primitive culture,
 * vol. 1 (of 2)" → the base. Used to detect when a collected edition and
 * its parts are both present.
 */
function baseTitle(raw: string): string {
  return cleanTitle(raw)
    .replace(/\s*[—–-]\s*(part|volume|vol\.?|book)\s+[\dIVXLC]+.*$/i, "")
    .replace(/\s*[\[(](part|volume|vol\.?|book)\s+[\dIVXLC]+[\])].*$/i, "")
    .replace(
      /\s*,?\s*(vol\.?|volume)\s*[\dIVXLC]+\s*(\(?of\s*\d+\)?)?\s*$/i,
      "",
    )
    .replace(/\s*[—–-]\s*complete\s*$/i, "")
    .trim();
}

/** Is the title a numbered part of something larger? */
const isPart = (raw: string) =>
  baseTitle(raw) !==
  cleanTitle(raw)
    .replace(/\s*[—–-]\s*complete\s*$/i, "")
    .trim();

/**
 * The volume number from a partial title, or null. Gibbon's *Decline and
 * Fall* exists only as six volumes, and all six share the same first 34
 * characters — without the number in the duplicate key below, exactly one
 * of them survives, arbitrarily chosen.
 */
function volumeNumber(raw: string): string | null {
  const title = cleanTitle(raw);
  const m = /\b(?:part|volume|vol\.?|book)\s+([\dIVXLC]+)\b/i.exec(title);
  if (m) return m[1].toUpperCase();
  // A spelled-out ordinal. Bruno's *Gli Eroici Furori* exists only in the
  // form "Part the First"/"Part the Second", and the key below strips
  // exactly the word `first` — the two halves got the same key and the
  // second was discarded as a duplicate.
  const written = /\bpart the (first|second|third|fourth)\b/i.exec(title);
  return written ? written[1].toUpperCase() : null;
}

/**
 * Key for duplicate detection: the same work in different editions should
 * collide, but volume 2 shouldn't collide with volume 3. Gibbon 731–736
 * and 890–895 are two editions of the same six volumes — they collide
 * pairwise, which is exactly what we want.
 */
const titleKey = (t: string) => {
  const base = cleanTitle(t)
    .toLowerCase()
    .replace(/^(the|a|an) /, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(
      /\b(complete|unabridged|part|volume|vol|book|first|second|third)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 34);
  const vol = volumeNumber(t);
  return vol ? `${base}#${vol}` : base;
};

/**
 * How many volumes of one and the same multi-volume work fit. Frazer's
 * *Golden Bough* has twelve volumes in its third edition; without a cap,
 * they alone would eat up anthropology's entire quota.
 */
const MAX_VOLUMES_PER_WORK = 6;

/**
 * Works that take priority over the rest of their author's when the cap
 * kicks in.
 *
 * Selection within an author is otherwise ranked by ascending Gutenberg
 * ID, and that's not a ranking by importance. For the treatise writers it
 * barely matters — they have ten works and the cap is twenty-five. For
 * the major poets it's devastating: Gutenberg's Shakespeare is in folio
 * order, so a cap of 12 gave *Henry VI* parts 1–3 and *Titus Andronicus*
 * but neither *Hamlet*, *Lear*, nor *The Tempest*. The list is hand-picked
 * and deliberately short — it only corrects the cases where the ID order
 * is obviously wrong.
 *
 * Ruskin is the same error in silent form. He has 59 English texts in the
 * catalog and philosophy's cap is 25, so the cutoff landed at ID 25897 —
 * and above the cutoff sat *The Stones of Venice* I–III (30754–30756) and
 * *The Seven Lamps of Architecture* (35898), i.e. exactly the works where
 * his argument about architecture lives. What remained was lectures on
 * birds, mosses, and a Venetian local index. It never looked like a bug:
 * the collection had 25 Ruskin works and Ruskin in the results list, just
 * never the one he's actually read for.
 */
const PRIORITY_IDS = new Set([
  // Shakespeare — the tragedies and the political plays, not the folio's opening pages
  1112,
  1114, 1120, 1122, 1124, 1126, 1127, 1128, 1129, 1131, 1132, 1135,
  // Greek tragedy and comedy
  31, 14484, 8604, 8714, 27458, 8418, 10096, 35173, 35451, 2562, 3013, 7700,
  7998,
  // Epic poetry
  2199, 3160, 1727, 228, 230, 232, 1004, 12867, 33896, 41085, 20, 58, 397, 608,
  // The novel
  996, 829, 84, 15, 76513, 42, 135, 145, 2413, 236, 2226, 35, 159, 32325, 86,
  2554, 28054, 600, 2638, 2600, 1399, 43372, 64908, 219, 974, 2021, 2480, 5658,
  // Drama after antiquity
  3023, 2527, 2446, 2467, 2542,
  // Tacitus on the Germanic tribes — the very source text for civilization versus barbarism
  7524,
  // Ruskin — the architecture works, which otherwise fall above philosophy's cap
  30754, 30755, 30756, 35898,
  // Eliot, Ash-Wednesday. Same ID trap as Ruskin, on a small scale:
  // poetry's cap is eight and Eliot has nine public-domain texts, so the
  // most recently added ID (78023) fell out — and that was the conversion
  // poem. What remained was the prose sketch *Eeldrop and
  // Appleplex* and the Pound pamphlet, which nobody reads Eliot for.
  78023,
  // Lang — anthropology, not the fairy-tale books. The worst ID trap in
  // the whole list: his eighty-three primary entries start at 128 (Arabian
  // Nights) and 503 (The Blue Fairy Book), so anthropology's cap of eight
  // would have given the collection six fairy-tale collections and none of
  // what he actually disputes with Frazer about. The eight below are
  // exactly the cap, so Lang becomes entirely a religion-anthropologist in
  // the collection. `Custom and Myth New Edition` (33260) is deliberately
  // left out: the lower ID wins anyway, and both editions would be the
  // same text twice.
  2832, 36794, 14080, 12353, 14576, 46480, 45363, 46546,
  // Holmes — the breakfast table and the essays. Without this, `Elsie
  // Venner` and `The Guardian Angel`, two novels, would have eaten a third
  // of the essay genre's cap of six.
  751, 2665, 2666, 2689, 2699, 2700,
  // Lowell — the prose. `The Complete Poetical Works` (13310) and `The
  // Biglow Papers` come before `My Study Windows` in ID order, and it's
  // the critic he's listed under essay for, not the verse.
  8503, 8509, 14481, 73710, 22609, 880,
  // Scott — `Waverley`, the novel that gave the genre its name. It's at
  // 2034 while `Ivanhoe` and four others sit lower, so prose's cap of six
  // took everything except the very book Scott is in the list for. 2034
  // is the single-volume edition; 4964/4965/4966 are the same text split
  // in two plus a "Complete" one and would eat three slots.
  2034,
  // Yeats — the poetry. His eighty entries start with five plays and four
  // prose books, and the first poetry collection doesn't appear until
  // 30488: without this, the collection's only Irish modernist stood in
  // the poetry genre with zero poems. The six below are the poetry
  // collections before 1920, i.e. the Yeats that's in the public domain.
  32233, 32491, 30488, 30652, 36865, 38877,
  // Morris — the same trap in a new form. 28 entries, prose's cap of six,
  // and without this the six lowest IDs take everything except the very
  // work he's in the list for: `News from Nowhere` (3261) sits above six
  // earlier romances in mock-medieval style and fell out of
  // `--show=Morris` until this line was added.
  3261,
]);

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

function main() {
  return loadCatalog().then((catalog) => {
    const dry = process.argv.includes("--dry");
    const works: CanonWork[] = [];
    const usedIds = new Set<string>();
    const usedGutenbergIds = new Set<number>();
    const unknown: string[] = [];
    const allFiltered: string[] = [];
    const missingExtra: string[] = [];
    const perAuthor: [string, number][] = [];

    for (const { authors, cap, label, genre } of GROUPS) {
      for (const key of authors) {
        const seenTitles = new Set<string>();

        // Keep the raw count separate: "the name isn't in the catalog" and
        // "all works got filtered out" are different errors and need
        // different fixes.
        const byAuthor = catalog.filter((row) => {
          const attr = attribution(row.authors);
          if (attr.dubious) return false;
          return attr.primary.some((p) => p.startsWith(key));
        });

        const cleaned = byAuthor.filter(
          (row) =>
            !DENY_IDS.has(row.id) &&
            (ALLOW_IDS.has(row.id) ||
              (!JUNK_TITLE.test(cleanTitle(row.title)) &&
                !JUNK_SUBTITLE.test(row.title.replace(/\s+/g, " ")))),
        );

        // A collected edition wins over its own parts. Spinoza's "Ethics"
        // (3800) and "Ethics — Part 1..5" are the same text; without this
        // it gets indexed twice and both show up in the results list.
        const series = new Map<string, CatalogRow[]>();
        for (const row of cleaned) {
          const b = baseTitle(row.title).toLowerCase();
          (series.get(b) ?? series.set(b, []).get(b)!).push(row);
        }
        const collapsed: CatalogRow[] = [];
        for (const group of series.values()) {
          const whole = group.filter((r) => !isPart(r.title));
          // If a whole edition exists: take it (lowest ID). Otherwise the
          // parts are all we have — but volumes 5–12 of the same work
          // must not eat up the author's entire quota.
          collapsed.push(
            ...(whole.length > 0
              ? [whole.sort((a, b) => a.id - b.id)[0]]
              : [...group]
                  .sort((a, b) => a.id - b.id)
                  .slice(0, MAX_VOLUMES_PER_WORK)),
          );
        }

        const matches = collapsed
          // The sort has to come BEFORE the duplicate filter: the filter
          // keeps the first entry with a given key, and "first" should
          // mean hand-picked or lowest ID — not the catalog's arbitrary
          // order. Dante's four Longfellow entries get the same key, and
          // without this "Hell" beat "Complete".
          .sort(
            (a, b) =>
              Number(PRIORITY_IDS.has(b.id)) - Number(PRIORITY_IDS.has(a.id)) ||
              a.id - b.id,
          )
          .filter((row) => {
            const k = titleKey(row.title);
            if (!k || seenTitles.has(k)) return false;
            seenTitles.add(k);
            return true;
          })
          .slice(0, cap);

        if (matches.length === 0) {
          if (byAuthor.length === 0) unknown.push(`${key}  (${label})`);
          else
            allFiltered.push(
              `${key}  (${label}) — ${byAuthor.length} verk, alla bortfiltrerade`,
            );
          continue;
        }
        perAuthor.push([
          key,
          matches.filter((m) => !usedGutenbergIds.has(m.id)).length,
        ]);

        for (const row of matches) {
          // Co-authored works match once per author — the Communist
          // Manifesto hits both Marx and Engels. Only take it the first time.
          if (usedGutenbergIds.has(row.id)) continue;
          usedGutenbergIds.add(row.id);

          const attr = attribution(row.authors);
          const primary =
            attr.primary.find((p) => p.startsWith(key)) ?? attr.primary[0];
          const { name, death } = lifespan(primary);
          const author = displayName(name);
          const title = cleanTitle(row.title);
          const year = death ?? YEAR_OVERRIDES.get(key) ?? 0;

          let id = `${slug(name.split(",")[0])}-${slug(title)}`.slice(0, 60);
          if (usedIds.has(id)) id = `${id}-${row.id}`;
          usedIds.add(id);

          works.push({
            id,
            source: "gutenberg",
            sourceId: String(row.id),
            language: "en",
            author,
            title,
            translator: attr.translator
              ? displayName(lifespan(attr.translator).name)
              : undefined,
            genre,
            // Approximate: the author's death year, not the work's
            // composition year. The catalog has no composition year, and
            // this suffices for sorting/era.
            year,
            era: eraOf(year),
            // Lets ingest verify that the ID points to the right edition (gutenberg.ts).
            titleMatch: title.toLowerCase().slice(0, 24),
            // The same folding `verifyHeader` does on the file header.
            // `slug` can't be used here: it replaces ø with a hyphen, so
            // Bjørnson became "bj-rnson" and never matched its own header.
            authorMatch: foldName(name.split(",")[0]),
          });
        }
      }
    }

    // Epics and sacred texts: fetched by ID, not via the author lists.
    // The catalog's author field is empty or lists the translator, so
    // there's nothing to search on.
    for (const extra of EXTRA) {
      if (usedGutenbergIds.has(extra.gutenbergId)) continue;
      usedGutenbergIds.add(extra.gutenbergId);

      const row = catalog.find((r) => r.id === extra.gutenbergId);
      if (!row) {
        missingExtra.push(
          `${extra.author} — PG ${extra.gutenbergId} finns inte i katalogen`,
        );
        continue;
      }
      const attr = attribution(row.authors);
      let id = `${slug(extra.author)}-${slug(extra.title)}`.slice(0, 60);
      if (usedIds.has(id)) id = `${id}-${extra.gutenbergId}`;
      usedIds.add(id);

      works.push({
        id,
        source: "gutenberg",
        sourceId: String(extra.gutenbergId),
        language: "en",
        author: extra.author,
        title: extra.title,
        translator: attr.translator
          ? displayName(lifespan(attr.translator).name)
          : undefined,
        genre: extra.genre,
        year: extra.year,
        era: eraOf(extra.year),
        titleMatch: extra.titleMatch.toLowerCase(),
        // Anonymous work: Gutenberg's file header has no Author line to check against.
        authorMatch: "",
      });
      perAuthor.push([extra.author, 1]);
    }

    works.sort(
      (a, b) => a.year - b.year || a.author.localeCompare(b.author, "sv"),
    );

    /* -------- rapport -------- */
    console.log(`\n${works.length} verk från ${perAuthor.length} författare\n`);
    const byEra = new Map<string, number>();
    for (const w of works) byEra.set(w.era, (byEra.get(w.era) ?? 0) + 1);
    console.log(
      "per epok:  " + [...byEra].map(([e, n]) => `${e} ${n}`).join(" · "),
    );

    const byGenre = new Map<string, number>();
    for (const w of works)
      byGenre.set(w.genre, (byGenre.get(w.genre) ?? 0) + 1);
    console.log(
      "per genre: " +
        [...byGenre]
          .sort((a, b) => b[1] - a[1])
          .map(([g, n]) => `${g} ${n}`)
          .join(" · "),
    );

    const top = [...perAuthor].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(
      "flest verk: " +
        top.map(([a, n]) => `${a.split(",")[0]} ${n}`).join(" · "),
    );

    // `--show=Ruskin` prints what the selection actually landed on for an
    // author. The report otherwise only says THAT the cap bound, never
    // WHAT it cut, and those are exactly the cases that don't look like
    // bugs: Ruskin had his 25 works and his place in the results list for
    // months without *Stones of Venice* being in the collection.
    const show = process.argv.find((a) => a.startsWith("--show="))?.slice(7);
    if (show) {
      const picked = works.filter((w) =>
        w.author.toLowerCase().includes(show.toLowerCase()),
      );
      console.log(`\n--show=${show}: ${picked.length} verk`);
      for (const w of picked.sort(
        (a, b) => Number(a.sourceId) - Number(b.sourceId),
      )) {
        console.log(
          `  ${w.sourceId.padStart(6)}  ${w.genre.padEnd(10)} ${w.year}  ${w.title}`,
        );
      }
    }

    if (unknown.length > 0) {
      console.error(
        `\n⚠  ${unknown.length} namn finns INTE i katalogen — fel namnform:`,
      );
      for (const m of unknown) console.error(`     ${m}`);
      console.error(
        "   Rätta strängen, annars saknas författaren tyst i samlingen.",
      );
    }
    if (allFiltered.length > 0) {
      console.error(
        `\n⚠  ${allFiltered.length} författare fick alla sina verk bortfiltrerade:`,
      );
      for (const m of allFiltered) console.error(`     ${m}`);
      console.error(
        "   Antingen har Gutenberg inget riktigt verk av dem, eller så är",
      );
      console.error(
        "   titelfiltret för hårt — lägg i så fall ID:t i ALLOW_IDS.",
      );
    }
    if (missingExtra.length > 0) {
      console.error(
        `\n⚠  ${missingExtra.length} poster i EXTRA saknas i katalogen:`,
      );
      for (const m of missingExtra) console.error(`     ${m}`);
    }

    writeManifest(OUT_PATH, works, dry);
    if (!dry) console.log("Kör `pnpm ingest` för att indexera.");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
