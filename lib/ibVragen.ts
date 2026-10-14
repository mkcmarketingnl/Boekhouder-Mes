// De vragen en uitleg van de inkomstenbelasting-modus. Alles hier is vaste tekst: de bedragen komen uit
// lib/belasting.ts, nooit van een AI. Het is algemene uitleg, geen persoonlijk belastingadvies.

export type IbVraagId = "urencriterium" | "starter" | "kia" | "aov" | "pensioen" | "vof_aandeel";

export interface IbVraag {
  id: IbVraagId;
  titel: string;
  vraag: string;
  // Korte uitleg in gewone taal
  uitleg: string;
  // Waarom dit ertoe doet en wat je ermee kunt
  leer: string;
  alleenVof?: boolean;
  // Antwoordsoort: ja/nee (met eventueel "weet ik niet"), of een ja/nee met een bedrag erbij
  soort: "janee" | "janee_bedrag" | "procent";
  bedragLabel?: string;
  bedragHint?: string;
}

export const IB_VRAGEN: IbVraag[] = [
  {
    id: "urencriterium",
    titel: "Urencriterium",
    vraag: "Werk je dit jaar minstens 1.225 uur aan je bedrijf?",
    uitleg: "Je hebt recht op ondernemersaftrek (zelfstandigenaftrek en startersaftrek) als je in een jaar minstens 1.225 uur voor je onderneming werkt. Dat is ongeveer 24 uur per week. Alle uren tellen mee: factureerbaar, administratie, acquisitie en opleiding.",
    leer: "Dit is de grootste schakelaar in je belasting. Haal je de uren niet, dan vervalt de zelfstandigenaftrek (2026: €1.200) en de startersaftrek (2026: €2.123). Houd daarom je uren bij: dat kan op het tabblad Uren. Reken de uren die je aan andere (loon)banen besteedt er niet bij.",
    soort: "janee",
  },
  {
    id: "starter",
    titel: "Startersaftrek",
    vraag: "Is je bedrijf in de afgelopen 5 jaar gestart, en heb je de startersaftrek nog niet 3 keer gebruikt?",
    uitleg: "Starters mogen de startersaftrek (2026: €2.123) maximaal 3 keer gebruiken in de eerste 5 jaar. Je moet dan ook voldoen aan het urencriterium. Er zijn nog meer voorwaarden (bijvoorbeeld dat je de jaren ervoor geen ondernemer was); controleer die bij de Belastingdienst.",
    leer: "Eerste jaar als ondernemer? Dan kan deze aftrek bovenop de zelfstandigenaftrek komen. Volgens de huidige plannen verdwijnt de startersaftrek in de komende jaren, dus als je ervoor in aanmerking komt, benut hem dan.",
    soort: "janee_bedrag",
    bedragLabel: "Hoe vaak heb je de startersaftrek al gebruikt in eerdere jaren?",
    bedragHint: "0, 1 of 2",
  },
  {
    id: "kia",
    titel: "Investeringen in je bedrijf",
    vraag: "Heb je dit jaar iets gekocht voor je bedrijf, zoals een laptop, machine of inventaris, van minstens €450 per stuk?",
    uitleg: "Voor investeringen in bedrijfsmiddelen krijg je extra aftrek: de kleineschaligheidsinvesteringsaftrek (KIA). Het totaal van je investeringen in het jaar moet minstens €2.900 zijn; dan is de aftrek 28% van het bedrag, tot een maximum van €20.072. Elk apparaat moet minstens €450 excl. BTW kosten.",
    leer: "Bovenop het afschrijven van de aanschaf trek je dus nog een deel van het bedrag extra van je winst af. Wil je iets groots kopen? Kijk dan of je het binnen één kalenderjaar met andere investeringen kunt combineren, want onder €2.900 per jaar krijg je niets.",
    soort: "janee_bedrag",
    bedragLabel: "Totaal van je investeringen dit jaar (excl. BTW)",
    bedragHint: "Bijvoorbeeld 3500",
  },
  {
    id: "aov",
    titel: "Arbeidsongeschiktheidsverzekering (AOV)",
    vraag: "Betaal je een arbeidsongeschiktheidsverzekering (AOV)?",
    uitleg: "Zelfstandigen hebben geen werkgever die doorbetaalt bij ziekte. Veel ondernemers sluiten daarom een AOV af. De premie is meestal aftrekbaar van je inkomen.",
    leer: "Een AOV beschermt je inkomen en verlaagt tegelijk je belasting, omdat je de premie aftrekt. Heb je er nog geen? Dan is dit meestal een van de eerste dingen om uit te zoeken.",
    soort: "janee_bedrag",
    bedragLabel: "Premie die je dit jaar betaalt",
    bedragHint: "Totaal per jaar",
  },
  {
    id: "pensioen",
    titel: "Pensioen of lijfrente",
    vraag: "Leg je geld opzij voor je pensioen via een lijfrente of pensioenverzekering?",
    uitleg: "Als ondernemer bouw je zelf pensioen op. Premies voor een lijfrente of pensioenverzekering mag je binnen je jaarruimte aftrekken van je inkomen.",
    leer: "Dit is een van de weinige manieren om rechtmatig belasting uit te stellen of te verlagen: je betaalt nu minder en later bij uitkering. Hoeveel je mag aftrekken (de jaarruimte) hangt af van je inkomen en wat je al hebt opgebouwd; de Belastingdienst toont dat in Mijn Belastingdienst. Deze berekening houdt geen rekening met die grens.",
    soort: "janee_bedrag",
    bedragLabel: "Premie die je dit jaar stort",
    bedragHint: "Totaal per jaar",
  },
  {
    id: "vof_aandeel",
    titel: "Je aandeel in de VOF",
    vraag: "Welk deel van de winst van de VOF is van jou?",
    uitleg: "Bij een VOF betaalt elke vennoot belasting over zijn eigen aandeel in de winst. De ondernemersaftrek en de MKB-winstvrijstelling krijgt ieder voor zich.",
    leer: "Zonder verdeling is de volledige winst als van jou gerekend, en dat geeft een te hoog bedrag.",
    alleenVof: true,
    soort: "procent",
    bedragLabel: "Jouw aandeel in procenten",
    bedragHint: "Bijvoorbeeld 50",
  },
];

export interface LeerKaart {
  id: string;
  titel: string;
  tekst: string;
}

export const LEERKAARTEN: LeerKaart[] = [
  {
    id: "box1",
    titel: "Hoe wordt je belasting berekend?",
    tekst: "Als eenmanszaak of VOF betaal je inkomstenbelasting over je winst: je omzet min je kosten. Daarvan gaan eerst de ondernemersaftrek en de MKB-winstvrijstelling af. Over wat overblijft betaal je belasting in schijven: hoe meer je verdient, hoe hoger het tarief over het hogere deel. Daarna trekken de heffingskortingen er een deel vanaf. Dat is wat deze pagina voor je uitrekent.",
  },
  {
    id: "mkb",
    titel: "De MKB-winstvrijstelling",
    tekst: "Je mag 12,7% van je winst (na ondernemersaftrek) vrijstellen van belasting. Je hoeft er niets voor aan te vragen en het urencriterium is niet nodig: de Belastingdienst verwerkt het in je aangifte.",
  },
  {
    id: "kortingen",
    titel: "Heffingskortingen",
    tekst: "De algemene heffingskorting en de arbeidskorting verlagen je belasting rechtstreeks. Ze zijn het hoogst bij een lage winst en worden minder bij een hogere winst. Daarom betaal je bij een kleine winst vaak weinig inkomstenbelasting, maar wel altijd de Zvw-bijdrage.",
  },
  {
    id: "zvw",
    titel: "Bijdrage Zorgverzekeringswet",
    tekst: "Naast inkomstenbelasting betaal je als ondernemer een inkomensafhankelijke bijdrage voor de zorgverzekering (2026: 4,85% over je belastbare winst, tot een maximum). Dit komt bovenop de premie die je aan je zorgverzekeraar betaalt, en wordt meestal pas na afloop van het jaar opgelegd.",
  },
  {
    id: "voorlopig",
    titel: "Voorlopige aanslag: betaal gespreid",
    tekst: "Je aangifte over 2026 doe je in 2027, en de aanslag komt daarna. Wil je niet in één keer een grote rekening? Dan kun je bij de Belastingdienst een voorlopige aanslag aanvragen, zodat je het hele jaar in termijnen betaalt. Zet intussen elke maand een deel opzij: dat bedrag laat deze pagina zien.",
  },
  {
    id: "deadline",
    titel: "Aangifte en bewaarplicht",
    tekst: "Je aangifte inkomstenbelasting over het vorige jaar doe je uiterlijk 1 mei (uitstel kun je aanvragen). Bewaar je administratie, inclusief facturen en bonnetjes, minstens 7 jaar.",
  },
  {
    id: "gemengd",
    titel: "Kosten die maar deels (of niet) aftrekbaar zijn",
    tekst: "Niet alles wat je uitgeeft mag je als kosten opvoeren. Voor eten, drinken en representatie gelden beperkingen: een deel is niet aftrekbaar. Boetes en privé-uitgaven zijn niet aftrekbaar. Twijfel je? Overleg met een boekhouder voordat je iets verwerkt. De app telt bonnen met horeca vooralsnog gewoon als kosten.",
  },
  {
    id: "thuis",
    titel: "Thuiswerken en je auto",
    tekst: "Een werkplek in je eigen huis levert alleen aftrek op als het echt een aparte, zelfstandige werkruimte is; een bureau in de woonkamer telt niet. Gebruik je je privéauto voor zakelijke ritten, dan gelden aparte regels voor een kilometervergoeding. Beide zijn lastig: vraag het eerst na bij een boekhouder.",
  },
  {
    id: "for",
    titel: "Wat is er veranderd?",
    tekst: "De fiscale oudedagsreserve (FOR) bestaat sinds 2023 niet meer. De zelfstandigenaftrek wordt volgens de huidige plannen de komende jaren stapsgewijs lager. Regels veranderen elk jaar, daarom staan ze in deze app per jaar op één plek en rekenen we bij een nieuw jaar met de laatst bekende regels totdat de nieuwe zijn vastgesteld.",
  },
];
