// Story content: notes, clues, lore records, character-specific lines and the chapter ending.

export const NOTES = {
  testament: {
    title: 'A Page in Your Own Handwriting',
    kind: 'note',
    text: `If you are reading this, it worked — and you have forgotten everything.

Seven nights. That is what the ritual costs. Seven nights of memory, burned like candles.

Do not trust the moon. Do not trust the Veiled Countess. And above all, do not trust what you were before you woke on this altar.

The Treaty is broken. The doors are sealed with blood — something in the nave will answer if you try to leave. Kill it. Then go to the village. Find who is left.

You will understand soon. I am sorry.

— You`,
  },
  sermon: {
    title: 'The Last Sermon of Father Anselm',
    kind: 'note',
    text: `"…and the moon shall turn to blood, and the old ones shall forget their oath."

I read those words to an empty cathedral tonight. Nobody came. The bells refused to ring.

Something is breathing beneath the floor. When I pressed my ear to the west wall of the north aisle, the stones sounded hollow, and I heard a heartbeat that was not mine.`,
  },
  clue_decree: {
    title: 'Royal Decree, Nailed to the Notice Board',
    kind: 'clue',
    text: `BY ORDER OF HER MAJESTY QUEEN LYSANDRA VAELMONT, SOVEREIGN OF THE ETERNAL NIGHT

On the night of the Conjunction all subjects, living and undying, shall remain indoors.

The Royal House will ascend to the Blood Altar to renew the Treaty with the moon.

Any who witness the ceremony shall be held in breach of the Treaty.

(Someone has scrawled beneath it in charcoal: "THEY WENT UP. ONLY ONE CAME DOWN.")`,
  },
  clue_ledger: {
    title: 'Hunter\'s Ledger — Order of the Pale Dawn',
    kind: 'clue',
    text: `Night 3 — Twelve missing. No bodies. No blood on the stones.

Night 4 — Tracks in the mud by the north gate. Something walked on two legs carrying a great weight. Many of them. They went north, into the Whispering Forest.

Night 5 — They are not killing the villagers. They are carrying them. Alive.

Something up there needs living blood. A great deal of it.`,
  },
  clue_journal: {
    title: 'Torn Journal of a Dead Hunter',
    kind: 'clue',
    text: `I saw the ceremony. Gods forgive me, I saw it.

The Queen knelt on the Altar. Her sister, the Veiled One, held the chalice. And a third stood behind them with a knife of black glass — young, crimson-eyed, unafraid.

The knife went into the Queen's heart, and the moon drank her.

Every vampire who fed that night became Hollow — mindless. All but one. The one with the knife. The Heartblood went into them.

If you find them: they will not remember. That is the worst part.`,
  },
  record_treaty: {
    title: 'Nocturnal Archive I — The Treaty of Eternal Night',
    kind: 'record',
    text: `Three hundred years ago, Queen Lysandra Vaelmont and the Council of Men signed the Treaty of Eternal Night.

Vampires would drink only from the willing. Men would keep the daylight and the churches, and the vampire houses would keep the night. The moon would be the witness, and the moon would be the price: as long as the royal Heartblood beat, the moon stayed silver.

Should the Heartblood ever be spilled, the moon would turn, and the oath would turn with it.`,
  },
  record_heartblood: {
    title: 'Nocturnal Archive II — On the Heartblood',
    kind: 'record',
    text: `The Heartblood is not a heart. It is a covenant made flesh, passed from monarch to heir through a single drop of blood.

Whoever carries it cannot become Hollow. Whoever carries it can work blood-magic forbidden to all others.

The Archive does not record what happens when the Heartblood is taken by force rather than given. The page that once did has been cut out with a very sharp blade.`,
  },
  record_hollow: {
    title: 'Nocturnal Archive III — The Hollow',
    kind: 'record',
    text: `Under a crimson moon, blood becomes a drug. A vampire who drinks beneath it forgets their name first, then their oath, then their face.

What remains is Hollow: armour without a knight, hunger without a mind. The Blood Crawlers are what is left of the smallest of them. The Night Stalkers were once the most beautiful.

There is no cure recorded. There is only the silver moon.`,
  },
  record_court: {
    title: 'Nocturnal Archive IV — The Court of a Thousand',
    kind: 'record',
    text: `When the Queen ascended, her court did not follow. One thousand and twenty-four vampires remain in Castle Nocturne, dancing beneath the red moon as if nothing has changed.

They are ruled now by the Twin Sovereigns — Dravik Solmere, the Crimson Sovereign, and Nyxara Vael, the Night Empress — who seized the empty throne on the seventh night.

Every vampire of the court carries a gift of blood. Befriend them, and they may fight for you. Slay them, and their gift is yours… until the day you die.`,
  },
  child_drawing: {
    title: 'A Child\'s Drawing',
    kind: 'note',
    text: `A drawing in red chalk: a big round moon, a little house, three stick figures holding hands.

Above the house, a fourth figure with long black hair and red eyes, smiling.

Underneath, in careful letters: "THE NICE LADY SAYS SHE WILL TAKE US SOMEWHERE SAFE."`,
  },
  forest_warning: {
    title: 'Words Carved into Bark',
    kind: 'note',
    text: `DONT STOP MOVING
THEY ONLY COME WHEN YOU STOP
DONT LOOK AT THE TALL ONES
DONT`,
  },
};

/** Character-specific inner monologue / dialogue lines. */
export const LINES = {
  lucien: {
    awaken: 'Cold stone. Candle smoke. The taste of someone else\'s blood… Seven nights, gone. How very inconvenient.',
    note: 'My own handwriting. I do not remember writing this. I do not enjoy that.',
    ambush: 'Things with too many legs. The cathedral used to have better guests.',
    village: 'The village of Ash. Once it smelled of bread. Now it smells of fear.',
    forest: 'The trees are whispering my name. Rude of them — I have not introduced myself.',
    altar: 'The moon is close enough to touch. And so, I suspect, is the truth.',
    countess: 'You know me. I can see it behind that veil.',
    victory: 'The veil falls. The moon does not.',
    castle: 'A thousand vampires dancing while the world ends. How… nostalgic.',
  },
  seraphina: {
    awaken: 'Mm. An altar. How dramatic of me. Seven nights missing — someone owes me an explanation.',
    note: 'My handwriting is lovely, even when I am warning myself. Concerning.',
    ambush: 'Crawling things. Let us see if their blood is as ugly as their faces.',
    village: 'Ashen Village. No music, no lamps, no hearts beating. Almost no hearts.',
    forest: 'Whispers in the fog. If you want my attention, darling, speak up.',
    altar: 'Such a pretty moon. It almost makes me forgive what it has done.',
    countess: 'A veil, a crown and a theatrical entrance. You and I would have been friends.',
    victory: 'Every rose has its thorns. Some of us have more than others.',
    castle: 'A ball! A thousand of us, and not one invitation sent to me. I am wounded.',
  },
  kairo: {
    awaken: 'Great. Woke up on an altar. In a cathedral. With fangs. This week keeps getting better.',
    note: 'A note from me to me. Past me is a terrible correspondent.',
    ambush: 'Bugs. Big bugs. Fine — I brought two very big swatters.',
    village: 'The Order trained me in places like this. They never trained me to be the monster in them.',
    forest: 'Fog, dead trees, whispering. Textbook ambush. Love that for me.',
    altar: 'If I die up there, someone tell the Order I was right about everything.',
    countess: 'Lady, I hunted things like you for a living. Old habits.',
    victory: 'One down. Feels like a thousand to go.',
    castle: 'Rule one of hunting: never walk into the vampire castle. Rule two: ignore rule one, apparently.',
  },
};

export const ENDING = {
  drain: {
    title: 'You Drank the Veil',
    text: `Her power floods into you — and with it, her last memory.

The Blood Altar, seven nights ago. The Queen kneeling. The Countess weeping as she held the chalice. And a figure with a black glass knife.

The figure turns, and you see its face. It is yours.

The Countess did not break the Treaty. She has spent seven nights trying to seal the wound you opened — feeding the moon with stolen villagers so that it would not fall.

Now there is no one left to feed it.

Above you, the crimson moon begins, very slowly, to descend.`,
  },
  mercy: {
    title: 'You Spared the Countess',
    text: `"Why…?" she breathes, and the veil slips from her face. Beneath it she is young, and she is crying.

"You do not remember. Of course you don't. You were my sister's chosen heir. She GAVE you the Heartblood — and someone made you use the knife."

She presses something into your hand: a black glass shard, still warm.

"The villagers are alive, in the catacombs below the Castle. I only took them to feed the moon, to keep it from falling. Find who held your hand that night. Find them before the moon comes down."

She dissolves into red mist. Far to the east, the lights of Castle Nocturne burn brighter than ever.`,
  },
  teaser: 'CHAPTER I COMPLETE — The Blood Moon still rises. The Court of a Thousand awaits in Castle Nocturne.',
};
