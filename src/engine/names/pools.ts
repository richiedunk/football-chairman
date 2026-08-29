/**
 * Nationality-aware name pools.
 *
 * These drive every person in the world — players, coaches, scouts, agents and
 * journalists — and keep doing so for decades of game time as generations age
 * out. Variety matters more than raw size: pairing 48 forenames with 48
 * surnames gives ~2,300 combinations per pool before nickname and
 * double-barrel rules, which is enough that a 40-season save does not start
 * feeling like it is recycling people.
 *
 * Pools are keyed by a pool id, not a nation id, because several nations draw
 * from the same pool (Austria from German, Wales from Welsh-inflected English)
 * and because diaspora weighting lets one nation draw from several pools.
 */

export interface NamePool {
  id: string
  forenames: string[]
  surnames: string[]
  /** Naming conventions that apply when generating from this pool. */
  conventions: NameConvention[]
  /** Particles inserted before surnames, e.g. Dutch "van der". */
  particles?: { text: string; chance: number }[]
}

export type NameConvention =
  | 'mononym' // may be known by a single name (Brazilian)
  | 'nickname' // may take a diminutive nickname
  | 'doubleSurname' // Spanish/Portuguese paternal + maternal
  | 'particle' // Dutch/German/Portuguese nobiliary particles
  | 'surnameFirst' // East Asian ordering
  | 'initialFirst' // known as "J. Smith" style occasionally

export const NAME_POOLS: Record<string, NamePool> = {
  english: {
    id: 'english',
    conventions: ['nickname'],
    forenames: [
      'Harry', 'Jack', 'Callum', 'Reece', 'Mason', 'Declan', 'Bukayo', 'Phil', 'Marcus', 'Jordan',
      'Kyle', 'Tyrone', 'Ollie', 'Alfie', 'Charlie', 'Louie', 'Finley', 'Rhys', 'Ashley', 'Dominic',
      'Nathan', 'Lewis', 'Connor', 'Bradley', 'Jamie', 'Ryan', 'Josh', 'Tom', 'Ben', 'Sam',
      'Elliot', 'Curtis', 'Regan', 'Kieran', 'Dean', 'Scott', 'Aaron', 'Liam', 'Adam', 'Joe',
      'Freddie', 'Archie', 'Theo', 'Reuben', 'Isaac', 'Noah', 'Leo', 'Jude',
    ],
    surnames: [
      'Ashworth', 'Bartlett', 'Blackwood', 'Bramley', 'Carrick', 'Chadwick', 'Colwill', 'Cresswell',
      'Doughty', 'Eastwood', 'Fairhurst', 'Fenwick', 'Gallagher', 'Gormley', 'Hadley', 'Halstead',
      'Hindmarsh', 'Holloway', 'Kettering', 'Lockyer', 'Longstaff', 'Marchant', 'Mellor', 'Netherwood',
      'Oakley', 'Pennington', 'Pickering', 'Quill', 'Radcliffe', 'Rowntree', 'Sanderson', 'Shackleton',
      'Sharples', 'Southgate', 'Standing', 'Thackeray', 'Tomlinson', 'Underhill', 'Vardy', 'Waddington',
      'Wainwright', 'Westbrook', 'Whitlow', 'Winstanley', 'Yates', 'Beardsley', 'Cadwell', 'Drinkwater',
    ],
  },
  scottish: {
    id: 'scottish',
    conventions: ['nickname'],
    forenames: [
      'Callum', 'Ryan', 'Kieran', 'Lewis', 'Stuart', 'Grant', 'Fraser', 'Angus', 'Hamish', 'Duncan',
      'Euan', 'Rory', 'Struan', 'Blair', 'Kenny', 'Iain', 'Craig', 'Gordon', 'Murray', 'Alasdair',
      'Finlay', 'Kyle', 'Scott', 'Greig', 'Dougal', 'Ewan', 'Malcolm', 'Ross', 'Innes', 'Torin',
      'Archie', 'Logan', 'Rab', 'Jock', 'Andrew', 'Douglas', 'Neil', 'Colin', 'Gavin', 'Barry',
      'Cameron', 'Lachlan', 'Niall', 'Roddy', 'Sandy', 'Tam', 'Wallace', 'Corrie',
    ],
    surnames: [
      'Ferguson', 'MacLeod', 'MacKay', 'Sinclair', 'Buchanan', 'Cunningham', 'Dalgleish', 'Drummond',
      'Elphinstone', 'Fyfe', 'Galbraith', 'Gillespie', 'Hendry', 'Inglis', 'Kerrigan', 'Lamont',
      'MacFarlane', 'MacIntyre', 'McAllister', 'McBride', 'McCulloch', 'McGarry', 'McIlroy', 'McKinnon',
      'Menzies', 'Moffat', 'Muirhead', 'Napier', 'Ogilvie', 'Paterson', 'Rennie', 'Ritchie',
      'Robertson', 'Shankland', 'Souttar', 'Strachan', 'Tannock', 'Urquhart', 'Wallace', 'Weir',
      'Wishart', 'Yorston', 'Bannatyne', 'Crawford', 'Dewar', 'Guthrie', 'Kinnear', 'Leask',
    ],
  },
  irish: {
    id: 'irish',
    conventions: ['nickname'],
    forenames: [
      'Conor', 'Seamus', 'Padraig', 'Cillian', 'Oisin', 'Darragh', 'Eoin', 'Ronan', 'Sean', 'Niall',
      'Fionn', 'Tadhg', 'Ruairi', 'Cathal', 'Diarmuid', 'Aidan', 'Brendan', 'Colm', 'Declan', 'Enda',
      'Fergal', 'Gearoid', 'Kevin', 'Liam', 'Malachy', 'Odhran', 'Peadar', 'Shane', 'Turlough', 'Cormac',
      'Barry', 'Killian', 'Lorcan', 'Micheal', 'Rory', 'Senan', 'Ultan', 'Ciaran',
      'Daire', 'Eamon', 'Feidhlim', 'Garvan', 'Iarla', 'Jarlath', 'Keelan', 'Manus', 'Naoise', 'Proinsias',
    ],
    surnames: [
      "O'Sullivan", "O'Donnell", "O'Reilly", "O'Shea", "O'Rourke", 'Kavanagh', 'Doherty', 'Gallagher',
      'Fitzgerald', 'Brennan', 'Coughlan', 'Cullen', 'Dempsey', 'Devlin', 'Donoghue', 'Dunphy',
      'Farrelly', 'Fogarty', 'Hanrahan', 'Hegarty', 'Hourihane', 'Keogh', 'Lenihan', 'Lynch',
      'Mangan', 'McGrath', 'Molloy', 'Moriarty', 'Mulcahy', 'Nolan', 'Prendergast', 'Quigley',
      'Rafferty', 'Scanlon', 'Sheridan', 'Slattery', 'Tierney', 'Treacy', 'Whelan', 'Cassidy',
      'Bergin', 'Corrigan', 'Duggan', 'Flanagan', 'Hackett', 'Kiernan', 'Loughlin', 'Meaney',
    ],
  },
  welsh: {
    id: 'welsh',
    conventions: ['nickname'],
    forenames: [
      'Rhys', 'Dylan', 'Gareth', 'Owain', 'Iwan', 'Geraint', 'Huw', 'Ieuan', 'Cai', 'Aled',
      'Bryn', 'Carwyn', 'Dewi', 'Emlyn', 'Ffion', 'Gwilym', 'Hywel', 'Idris', 'Llew', 'Meirion',
      'Morgan', 'Osian', 'Rhodri', 'Sion', 'Tomos', 'Trystan', 'Wyn', 'Elis',
      'Deian', 'Efan', 'Gruffydd', 'Ianto', 'Lloyd', 'Mabon', 'Neirin', 'Padrig',
      'Berwyn', 'Cadog', 'Dafydd', 'Eryl', 'Gethin', 'Ilar', 'Lewys', 'Macsen', 'Steffan', 'Taliesin',
      'Alun', 'Cerith',
    ],
    surnames: [
      'Davies', 'Llewellyn', 'Pritchard', 'Vaughan', 'Meredith', 'Bevan', 'Cadwallader', 'Ellis',
      'Gough', 'Griffiths', 'Hopkin', 'Howells', 'Jenkins', 'Lloyd', 'Maddock', 'Morgan',
      'Owens', 'Parry', 'Powell', 'Prosser', 'Rees', 'Rhydderch', 'Tudor', 'Vaughn',
      'Wyn-Jones', 'Bowen', 'Caddick', 'Emlyn', 'Fychan', 'Gwynne', 'Havard', 'Idwal',
      'Kyffin', 'Llywelyn', 'Mostyn', 'Nash', 'Penry', 'Probert', 'Rowlands', 'Trahaearn',
      'Vaughan-Hughes', 'Wogan', 'Beddoe', 'Cadwgan', 'Dyfed', 'Glyn', 'Heulwen', 'Ithel',
    ],
  },
  french: {
    id: 'french',
    conventions: ['nickname', 'particle'],
    particles: [{ text: 'de', chance: 0.03 }, { text: 'le', chance: 0.02 }],
    forenames: [
      'Antoine', 'Baptiste', 'Clement', 'Damien', 'Enzo', 'Florian', 'Gaetan', 'Hugo', 'Jules', 'Kylian',
      'Lucas', 'Mathis', 'Nolan', 'Olivier', 'Pierre', 'Quentin', 'Raphael', 'Sacha', 'Theo', 'Ugo',
      'Valentin', 'Xavier', 'Yanis', 'Adrien', 'Bastien', 'Cedric', 'Dorian', 'Elias', 'Fabien', 'Guillaume',
      'Hadrien', 'Ilan', 'Jocelyn', 'Kevin', 'Loic', 'Maxence', 'Noe', 'Octave', 'Paul', 'Remy',
      'Sebastien', 'Tristan', 'Vincent', 'Wilfried', 'Yohan', 'Aurelien', 'Corentin', 'Matteo',
    ],
    surnames: [
      'Bertrand', 'Chevalier', 'Dubois', 'Delacroix', 'Fontaine', 'Girard', 'Hebert', 'Laurent',
      'Marchand', 'Nicolas', 'Ollivier', 'Perrin', 'Rousseau', 'Sabatier', 'Thibault', 'Vasseur',
      'Aubert', 'Barbier', 'Caron', 'Dupuis', 'Estève', 'Fournier', 'Gauthier', 'Hamon',
      'Jourdain', 'Lefebvre', 'Mercier', 'Noiret', 'Pasquier', 'Renaud', 'Salvatore', 'Tessier',
      'Vallet', 'Bonnet', 'Chartier', 'Deschamps', 'Escoffier', 'Fabre', 'Guillory', 'Havard',
      'Lambert', 'Moulin', 'Peyrat', 'Quentin', 'Roussel', 'Sarrazin', 'Truffaut', 'Vidal',
    ],
  },
  spanish: {
    id: 'spanish',
    conventions: ['mononym', 'nickname', 'doubleSurname'],
    forenames: [
      'Alejandro', 'Alvaro', 'Adrian', 'Borja', 'Carlos', 'Diego', 'Eduardo', 'Fernando', 'Gonzalo', 'Hector',
      'Ignacio', 'Javier', 'Kike', 'Lucas', 'Marcos', 'Nacho', 'Oscar', 'Pablo', 'Rodrigo', 'Sergio',
      'Tomas', 'Unai', 'Victor', 'Xabi', 'Yeray', 'Aitor', 'Bruno', 'Cesar', 'Dani', 'Enrique',
      'Fran', 'Gerard', 'Hugo', 'Inigo', 'Jorge', 'Koke', 'Luis', 'Manu', 'Nico', 'Pau',
      'Raul', 'Samuel', 'Toni', 'Vicente', 'Asier', 'Beñat', 'Iker', 'Mikel',
    ],
    surnames: [
      'Alonso', 'Bermejo', 'Cabrera', 'Delgado', 'Escudero', 'Fuentes', 'Gallardo', 'Herrera',
      'Iglesias', 'Jimenez', 'Lozano', 'Montero', 'Navarro', 'Ocampos', 'Pardo', 'Quiroga',
      'Robledo', 'Salinas', 'Tejada', 'Ubeda', 'Valverde', 'Zamora', 'Arrieta', 'Bustos',
      'Carvajal', 'Duarte', 'Esparza', 'Ferreras', 'Guzman', 'Hidalgo', 'Isasi', 'Jaramillo',
      'Larrea', 'Mendoza', 'Nogales', 'Olmedo', 'Peralta', 'Requena', 'Sarabia', 'Torrente',
      'Urrutia', 'Vergara', 'Ybarra', 'Zubizarreta', 'Cazorla', 'Domenech', 'Elorza', 'Merino',
    ],
  },
  portuguese: {
    id: 'portuguese',
    conventions: ['mononym', 'nickname', 'doubleSurname', 'particle'],
    particles: [{ text: 'da', chance: 0.08 }, { text: 'de', chance: 0.06 }, { text: 'dos', chance: 0.04 }],
    forenames: [
      'Andre', 'Bruno', 'Cristiano', 'Diogo', 'Eduardo', 'Fabio', 'Goncalo', 'Hugo', 'Ivan', 'Joao',
      'Leandro', 'Miguel', 'Nuno', 'Otavio', 'Pedro', 'Rafael', 'Ruben', 'Sergio', 'Tiago', 'Vitor',
      'Alexandre', 'Bernardo', 'Carlos', 'Daniel', 'Emanuel', 'Filipe', 'Gil', 'Henrique',
      'Ismael', 'Jorge', 'Luis', 'Marco', 'Nelson', 'Paulo', 'Ricardo', 'Salvador',
      'Tomas', 'Vasco', 'Afonso', 'Duarte', 'Francisco', 'Gustavo', 'Joel', 'Martim',
      'Rodrigo', 'Simao', 'Telmo', 'Xavier',
    ],
    surnames: [
      'Almeida', 'Barbosa', 'Cardoso', 'Domingues', 'Esteves', 'Ferreira', 'Gomes', 'Henriques',
      'Inacio', 'Jesus', 'Lourenco', 'Magalhaes', 'Neves', 'Oliveira', 'Pinto', 'Queiroz',
      'Ribeiro', 'Sampaio', 'Teixeira', 'Vasconcelos', 'Xavier', 'Azevedo', 'Braga', 'Coelho',
      'Dias', 'Fonseca', 'Guedes', 'Horta', 'Leal', 'Machado', 'Nogueira', 'Pacheco',
      'Rocha', 'Salgado', 'Tavares', 'Valente', 'Amorim', 'Bastos', 'Carvalho', 'Faria',
      'Guerreiro', 'Loureiro', 'Mendes', 'Peixoto', 'Rosario', 'Simoes', 'Trindade', 'Varela',
    ],
  },
  italian: {
    id: 'italian',
    conventions: ['nickname', 'particle'],
    particles: [{ text: 'De', chance: 0.05 }, { text: 'Di', chance: 0.05 }, { text: 'Del', chance: 0.03 }],
    forenames: [
      'Alessandro', 'Andrea', 'Bruno', 'Cristian', 'Davide', 'Emiliano', 'Federico', 'Gianluca', 'Iacopo', 'Lorenzo',
      'Marco', 'Nicolo', 'Ottavio', 'Paolo', 'Riccardo', 'Salvatore', 'Tommaso', 'Umberto', 'Valerio', 'Alberto',
      'Bernardo', 'Cesare', 'Domenico', 'Enrico', 'Fabio', 'Giacomo', 'Ivan', 'Leonardo',
      'Massimo', 'Nicola', 'Orlando', 'Pietro', 'Ruggero', 'Simone', 'Tiziano', 'Vittorio',
      'Antonio', 'Carlo', 'Dario', 'Ettore', 'Filippo', 'Giulio', 'Luca', 'Matteo',
      'Rocco', 'Stefano', 'Vincenzo', 'Mattia',
    ],
    surnames: [
      'Barbieri', 'Calabrese', 'Donati', 'Esposito', 'Fiorentino', 'Gallo', 'Iannone', 'Lombardi',
      'Marchetti', 'Nardone', 'Orlandi', 'Pellegrini', 'Quaranta', 'Riva', 'Santoro', 'Tosi',
      'Vitale', 'Zanetti', 'Amato', 'Bellini', 'Caruso', 'Ferrara', 'Grasso', 'Leone',
      'Mancini', 'Neri', 'Palumbo', 'Rinaldi', 'Sartori', 'Trevisan', 'Valenti', 'Zola',
      'Bianchi', 'Colombo', 'Damico', 'Ferretti', 'Greco', 'Longo', 'Moretti', 'Parisi',
      'Rizzo', 'Sorrentino', 'Testa', 'Vieri', 'Bonucci', 'Cavaliere', 'Fabbri', 'Marino',
    ],
  },
  german: {
    id: 'german',
    conventions: ['nickname', 'particle'],
    particles: [{ text: 'von', chance: 0.02 }],
    forenames: [
      'Alexander', 'Benedikt', 'Christoph', 'Dominik', 'Emre', 'Fabian', 'Gerrit', 'Hendrik', 'Jonas', 'Kai',
      'Leon', 'Maximilian', 'Niklas', 'Ole', 'Pascal', 'Rene', 'Sebastian', 'Timo', 'Ulrich', 'Valentin',
      'Andreas', 'Bastian', 'Christian', 'David', 'Erik', 'Florian', 'Georg', 'Hannes',
      'Jannik', 'Konstantin', 'Lukas', 'Marius', 'Nico', 'Oliver', 'Philipp', 'Robin',
      'Simon', 'Thilo', 'Vincent', 'Yannick', 'Arne', 'Bjorn', 'Felix', 'Julian',
      'Lennart', 'Moritz', 'Tobias', 'Jannis',
    ],
    surnames: [
      'Achterberg', 'Brandt', 'Cordes', 'Dittmar', 'Ehrlich', 'Fahrenholz', 'Gerlach', 'Hoffmann',
      'Iversen', 'Junker', 'Kirchner', 'Lindemann', 'Muhlbauer', 'Neuhaus', 'Ostermann', 'Puttkamer',
      'Reinhardt', 'Schafer', 'Trautmann', 'Ulmer', 'Vogel', 'Wagner', 'Zimmermann', 'Bruckner',
      'Denzel', 'Engelhardt', 'Frohlich', 'Gundlach', 'Hartwig', 'Ilgner', 'Kaltenbach', 'Lehnert',
      'Maier', 'Nagelsmann', 'Overath', 'Papendieck', 'Rieger', 'Steinbach', 'Thalmann', 'Uhlig',
      'Vollmer', 'Weidner', 'Ziegler', 'Bergmann', 'Dreher', 'Falkenberg', 'Grunwald', 'Kohler',
    ],
  },
  dutch: {
    id: 'dutch',
    conventions: ['particle', 'nickname'],
    particles: [
      { text: 'van', chance: 0.18 },
      { text: 'van der', chance: 0.1 },
      { text: 'de', chance: 0.08 },
      { text: 'van den', chance: 0.05 },
      { text: 'ten', chance: 0.03 },
    ],
    forenames: [
      'Bram', 'Cody', 'Daan', 'Eljero', 'Ferdi', 'Guus', 'Hans', 'Ivo', 'Jurrien', 'Koen',
      'Lars', 'Matthijs', 'Noa', 'Olivier', 'Pim', 'Quinten', 'Ruud', 'Sven', 'Teun', 'Vincent',
      'Wout', 'Xavi', 'Youri', 'Arjen', 'Bas', 'Cas', 'Dirk', 'Erwin',
      'Frenkie', 'Gijs', 'Hugo', 'Jasper', 'Kick', 'Luuk', 'Mees', 'Nick',
      'Owen', 'Pepijn', 'Ryan', 'Stijn', 'Thijs', 'Wesley', 'Bart', 'Dani',
      'Jeroen', 'Marten', 'Rick', 'Tijmen',
    ],
    surnames: [
      'Aardenburg', 'Beek', 'Cruyff', 'Dijkstra', 'Elzinga', 'Fransen', 'Groot', 'Heerdink',
      'Ijsselstein', 'Jansen', 'Koster', 'Leeuwen', 'Meijer', 'Nieuwkoop', 'Oosterhuis', 'Prins',
      'Rijkaard', 'Smulders', 'Terpstra', 'Uijtdehaage', 'Verhoeven', 'Wijnaldum', 'Zoetermeer', 'Bakker',
      'Cornelisse', 'Doorn', 'Enthoven', 'Fokkema', 'Gerritsen', 'Hoedt', 'Jonker', 'Kuijpers',
      'Loos', 'Mulder', 'Nijland', 'Osinga', 'Postma', 'Reijnders', 'Schouten', 'Tuinstra',
      'Veerman', 'Wijndal', 'Bosman', 'Dekker', 'Hendriks', 'Kuiper', 'Molenaar', 'Visser',
    ],
  },
  belgian: {
    id: 'belgian',
    conventions: ['particle', 'nickname'],
    particles: [{ text: 'De', chance: 0.12 }, { text: 'Van', chance: 0.1 }],
    forenames: [
      'Amadou', 'Brecht', 'Charles', 'Dodi', 'Elias', 'Fabio', 'Gaetan', 'Hans', 'Ilias', 'Jarne',
      'Koen', 'Lander', 'Maxim', 'Nathan', 'Olivier', 'Pieter', 'Robbe', 'Senne', 'Thibaut', 'Vic',
      'Wout', 'Yari', 'Zeno', 'Arne', 'Bryan', 'Cisse', 'Dries', 'Emile',
      'Ferran', 'Gilles', 'Hugo', 'Jorne', 'Kobe', 'Lars', 'Milan', 'Noa',
      'Otto', 'Quinten', 'Ruben', 'Stef', 'Tuur', 'Vince', 'Warre', 'Yorbe',
      'Aster', 'Bilal', 'Cyriel', 'Dante',
    ],
    surnames: [
      'Aerts', 'Buysse', 'Coucke', 'Debast', 'Engels', 'Faes', 'Goossens', 'Hazard',
      'Impens', 'Janssens', 'Kums', 'Lukaku', 'Mechele', 'Nainggolan', 'Openda', 'Praet',
      'Raskin', 'Sels', 'Theate', 'Vanaken', 'Wilmots', 'Bornauw', 'Casteels', 'Doku',
      'Everaert', 'Frankeur', 'Geens', 'Heynen', 'Ilombe', 'Jutgla', 'Kayembe', 'Lavia',
      'Maertens', 'Nielsen', 'Onana', 'Peeters', 'Roef', 'Smets', 'Trossard', 'Vermeulen',
      'Willems', 'Bakayoko', 'Claes', 'Delcroix', 'Hendrickx', 'Maes', 'Sierens', 'Vercauteren',
    ],
  },
  brazilian: {
    id: 'brazilian',
    conventions: ['mononym', 'nickname', 'particle', 'doubleSurname'],
    particles: [{ text: 'da', chance: 0.1 }, { text: 'dos', chance: 0.07 }, { text: 'de', chance: 0.05 }],
    forenames: [
      'Adriano', 'Bruno', 'Caio', 'Danilo', 'Eder', 'Fabinho', 'Gabriel', 'Heitor', 'Igor', 'Joao',
      'Kaio', 'Lucas', 'Matheus', 'Neto', 'Otavio', 'Paulinho', 'Rafael', 'Samuel', 'Thiago', 'Vinicius',
      'Wesley', 'Yuri', 'Alisson', 'Bernardo', 'Cauã', 'Douglas', 'Emerson', 'Felipe',
      'Guilherme', 'Hugo', 'Italo', 'Juninho', 'Kleber', 'Leandro', 'Murilo', 'Nathan',
      'Pedro', 'Renan', 'Sandro', 'Tiago', 'Vitor', 'Wanderson', 'Andre', 'Diego',
      'Everton', 'Gustavo', 'Luan', 'Richarlison',
    ],
    surnames: [
      'Alves', 'Barbosa', 'Cavalcanti', 'Duarte', 'Esteves', 'Ferreira', 'Gomes', 'Henrique',
      'Inacio', 'Jesus', 'Lima', 'Moraes', 'Nascimento', 'Oliveira', 'Pereira', 'Queiroz',
      'Ribeiro', 'Santos', 'Teixeira', 'Vieira', 'Xavier', 'Almeida', 'Bezerra', 'Carvalho',
      'Dantas', 'Fagundes', 'Guimaraes', 'Holanda', 'Junqueira', 'Lacerda', 'Macedo', 'Nogueira',
      'Pacheco', 'Rezende', 'Siqueira', 'Tavares', 'Vasconcelos', 'Andrade', 'Braga', 'Cordeiro',
      'Freitas', 'Goulart', 'Marques', 'Peixoto', 'Rocha', 'Souza', 'Vargas', 'Batista',
    ],
  },
  argentine: {
    id: 'argentine',
    conventions: ['nickname', 'doubleSurname'],
    forenames: [
      'Agustin', 'Bruno', 'Cristian', 'Damian', 'Emiliano', 'Facundo', 'Gonzalo', 'Hernan', 'Ivan', 'Julian',
      'Lautaro', 'Matias', 'Nahuel', 'Octavio', 'Pablo', 'Ramiro', 'Santiago', 'Thiago', 'Valentin', 'Alejo',
      'Benjamin', 'Cristo', 'Diego', 'Ezequiel', 'Franco', 'Geronimo', 'Ignacio', 'Joaquin',
      'Leandro', 'Maxi', 'Nicolas', 'Ortiz', 'Patricio', 'Rodrigo', 'Sebastian', 'Tomas',
      'Alan', 'Braian', 'Ciro', 'Enzo', 'Gaston', 'Hugo', 'Kevin', 'Lucas',
      'Marcos', 'Nehuen', 'Rodrigo', 'Tiago',
    ],
    surnames: [
      'Aguirre', 'Benitez', 'Cardozo', 'Dominguez', 'Escobar', 'Fernandez', 'Gimenez', 'Herrera',
      'Ibarra', 'Juarez', 'Lopez', 'Molina', 'Nunez', 'Ortega', 'Paredes', 'Quintero',
      'Romero', 'Sosa', 'Torres', 'Urbina', 'Vazquez', 'Zarate', 'Acosta', 'Bustos',
      'Caceres', 'Duarte', 'Estigarribia', 'Franco', 'Gallardo', 'Heredia', 'Insua', 'Ledesma',
      'Maidana', 'Nardo', 'Olivera', 'Pizarro', 'Rojas', 'Salvatierra', 'Toledo', 'Villalba',
      'Zabaleta', 'Almiron', 'Cabrera', 'Ferreyra', 'Godoy', 'Luna', 'Peralta', 'Silvestre',
    ],
  },
  nordic: {
    id: 'nordic',
    conventions: ['nickname'],
    forenames: [
      'Anders', 'Bjorn', 'Casper', 'Emil', 'Fredrik', 'Gustav', 'Henrik', 'Isak', 'Jesper', 'Kasper',
      'Lars', 'Magnus', 'Nils', 'Oskar', 'Patrik', 'Rasmus', 'Sander', 'Tobias', 'Viktor', 'William',
      'Alexander', 'Birk', 'Christian', 'Elias', 'Filip', 'Halvard', 'Ivar', 'Jonas',
      'Kristoffer', 'Leo', 'Mathias', 'Noah', 'Olav', 'Petter', 'Sigurd', 'Theodor',
      'Ulrik', 'Vegard', 'Axel', 'Erling', 'Hakon', 'Jakob', 'Martin', 'Odin',
      'Sebastian', 'Torbjorn', 'Vidar', 'Alfons',
    ],
    surnames: [
      'Andersson', 'Berg', 'Christensen', 'Dahl', 'Eriksen', 'Fagerli', 'Gundersen', 'Haaland',
      'Isaksen', 'Jorgensen', 'Karlsson', 'Lindqvist', 'Mikkelsen', 'Nyland', 'Olsen', 'Pedersen',
      'Rasmussen', 'Sorensen', 'Thorsen', 'Ulvestad', 'Vestergaard', 'Wahlberg', 'Aasen', 'Bakken',
      'Cederberg', 'Dyngeland', 'Ekdal', 'Forsberg', 'Gislason', 'Hagen', 'Ingebrigtsen', 'Johansson',
      'Kvist', 'Lofgren', 'Moberg', 'Nordtveit', 'Ostberg', 'Palsson', 'Ryerson', 'Strand',
      'Tveita', 'Vinter', 'Ahlberg', 'Bergstrom', 'Elvedi', 'Hjulmand', 'Nilsson', 'Sandberg',
    ],
  },
  polish: {
    id: 'polish',
    conventions: ['nickname'],
    forenames: [
      'Adam', 'Bartosz', 'Cezary', 'Dawid', 'Filip', 'Grzegorz', 'Hubert', 'Igor', 'Jakub', 'Kamil',
      'Lukasz', 'Marcin', 'Nikodem', 'Oskar', 'Piotr', 'Rafal', 'Szymon', 'Tomasz', 'Wojciech', 'Zbigniew',
      'Arkadiusz', 'Bartlomiej', 'Damian', 'Eryk', 'Fabian', 'Gustaw', 'Jaroslaw', 'Krzysztof',
      'Leszek', 'Mateusz', 'Norbert', 'Pawel', 'Radoslaw', 'Sebastian', 'Tadeusz', 'Wiktor',
      'Alan', 'Blazej', 'Dominik', 'Emil', 'Jacek', 'Konrad', 'Maciej', 'Przemyslaw',
      'Robert', 'Stanislaw', 'Tymoteusz', 'Zygmunt',
    ],
    surnames: [
      'Adamczyk', 'Blaszczyk', 'Cieslak', 'Dabrowski', 'Frankowski', 'Grabowski', 'Jankowski', 'Kaczmarek',
      'Lewandowski', 'Michalski', 'Nowak', 'Olszewski', 'Pawlak', 'Rutkowski', 'Sikora', 'Szymanski',
      'Tomaszewski', 'Walczak', 'Zielinski', 'Baranowski', 'Chojnacki', 'Duda', 'Gajewski', 'Jozwiak',
      'Kowalczyk', 'Lis', 'Maslanka', 'Nowicki', 'Ostrowski', 'Piatek', 'Sadowski', 'Sobczak',
      'Urbanski', 'Wieczorek', 'Zalewski', 'Bednarek', 'Czerwinski', 'Glik', 'Jagiello', 'Krychowiak',
      'Milik', 'Piszczek', 'Rybus', 'Stepinski', 'Wojciechowski', 'Zurawski', 'Kedziora', 'Moder',
    ],
  },
  balkan: {
    id: 'balkan',
    conventions: ['nickname'],
    forenames: [
      'Aleksandar', 'Bojan', 'Dejan', 'Filip', 'Goran', 'Ivan', 'Josip', 'Luka', 'Marko', 'Nemanja',
      'Ognjen', 'Petar', 'Stefan', 'Tomislav', 'Uros', 'Vladimir', 'Zoran', 'Andrej', 'Borna', 'Danijel',
      'Emir', 'Franjo', 'Hrvoje', 'Ivica', 'Kristijan', 'Lovro', 'Mateo', 'Nikola',
      'Predrag', 'Ranko', 'Sasa', 'Tin', 'Vedran', 'Zlatko', 'Antonio', 'Bruno',
      'Domagoj', 'Erik', 'Igor', 'Josko', 'Mario', 'Nikica', 'Roko', 'Sime',
      'Toma', 'Vlado', 'Zeljko', 'Dario',
    ],
    surnames: [
      'Andric', 'Babic', 'Cvitanovic', 'Dragovic', 'Erceg', 'Filipovic', 'Gvardiol', 'Horvat',
      'Ivanovic', 'Jovanovic', 'Kovacic', 'Lukic', 'Markovic', 'Novakovic', 'Obradovic', 'Perisic',
      'Radulovic', 'Simic', 'Todorovic', 'Vlasic', 'Zivkovic', 'Brekalo', 'Cirkovic', 'Dukic',
      'Grujic', 'Halilovic', 'Jurcevic', 'Kramaric', 'Lazovic', 'Mitrovic', 'Nikolic', 'Pavlovic',
      'Rakitic', 'Stankovic', 'Tadic', 'Vukovic', 'Barisic', 'Djordjevic', 'Gajic', 'Ilic',
      'Katic', 'Milinkovic', 'Petkovic', 'Sosa', 'Vranjes', 'Zlatkovic', 'Modric', 'Susic',
    ],
  },
  turkish: {
    id: 'turkish',
    conventions: ['nickname'],
    forenames: [
      'Ahmet', 'Berkay', 'Cengiz', 'Deniz', 'Emre', 'Ferdi', 'Gokhan', 'Hakan', 'Ilhan', 'Kaan',
      'Levent', 'Mert', 'Nihat', 'Okan', 'Ozan', 'Rıdvan', 'Serdar', 'Taylan', 'Umut', 'Volkan',
      'Yusuf', 'Zeki', 'Arda', 'Baris', 'Caner', 'Dogan', 'Efe', 'Furkan',
      'Gurkan', 'Halil', 'Ismail', 'Kerem', 'Mahmut', 'Necip', 'Onur', 'Rahman',
      'Sinan', 'Tolga', 'Ugur', 'Yunus', 'Alper', 'Burak', 'Enes', 'Kadir',
      'Murat', 'Orkun', 'Salih', 'Tunahan',
    ],
    surnames: [
      'Akbulut', 'Bayram', 'Cakir', 'Demir', 'Erdogan', 'Fidan', 'Gunes', 'Hakverdi',
      'Isikli', 'Kaya', 'Levent', 'Mutlu', 'Nazli', 'Ozturk', 'Polat', 'Sahin',
      'Tekin', 'Ustundag', 'Yildiz', 'Zorlu', 'Arslan', 'Bulut', 'Ciftci', 'Dogan',
      'Ercan', 'Guler', 'Kilic', 'Korkmaz', 'Kurtulus', 'Ozdemir', 'Sari', 'Toprak',
      'Turan', 'Yalcin', 'Yilmaz', 'Aydin', 'Celik', 'Duman', 'Erdem', 'Gencer',
      'Karaca', 'Kocak', 'Ozkan', 'Sonmez', 'Tosun', 'Uzun', 'Yaman', 'Calhanoglu',
    ],
  },
  greek: {
    id: 'greek',
    conventions: ['nickname'],
    forenames: [
      'Alexandros', 'Christos', 'Dimitris', 'Evangelos', 'Georgios', 'Ilias', 'Kostas', 'Lefteris', 'Manolis', 'Nikos',
      'Odysseas', 'Panagiotis', 'Sotiris', 'Thanasis', 'Vangelis', 'Yiannis', 'Zisis', 'Andreas', 'Charalampos', 'Dionysis',
      'Efstathios', 'Fotis', 'Grigoris', 'Iraklis', 'Konstantinos', 'Marios', 'Nektarios', 'Orestis',
      'Petros', 'Stefanos', 'Tasos', 'Vasilis', 'Anastasios', 'Babis', 'Kyriakos', 'Leonidas',
      'Michalis', 'Pavlos', 'Spyros', 'Theodoros', 'Achilleas', 'Damianos', 'Filippos', 'Haris',
      'Lazaros', 'Nasos', 'Stergios', 'Vlasis',
    ],
    surnames: [
      'Antoniou', 'Bakasetas', 'Christodoulou', 'Dimitriou', 'Eleftheriou', 'Fortounis', 'Giannoulis', 'Hatzidiakos',
      'Iordanou', 'Karagiannis', 'Lambropoulos', 'Mavropanos', 'Nikolaou', 'Oikonomou', 'Papadopoulos', 'Retsos',
      'Samaris', 'Tzavellas', 'Vlachodimos', 'Zafeiris', 'Andreadis', 'Bouchalakis', 'Chatzigiovanis', 'Douvikas',
      'Galanopoulos', 'Ioannidis', 'Konstantelias', 'Limnios', 'Masouras', 'Ntoi', 'Pelkas', 'Rota',
      'Siopis', 'Tsimikas', 'Vagiannidis', 'Zeca', 'Athanasiadis', 'Chalkiadakis', 'Kourbelis', 'Manolas',
      'Pavlidis', 'Sotiriou', 'Tsoukalas', 'Vrousai', 'Kyriakopoulos', 'Ntinas', 'Stafylidis', 'Zagaritis',
    ],
  },
  westAfrican: {
    id: 'westAfrican',
    conventions: ['nickname'],
    forenames: [
      'Abdoulaye', 'Bakary', 'Cheikh', 'Demba', 'Elhadji', 'Fode', 'Gana', 'Habib', 'Ibrahima', 'Kalidou',
      'Lamine', 'Mamadou', 'Ndiaye', 'Ousmane', 'Papa', 'Sadio', 'Souleymane', 'Youssouf', 'Amadou', 'Boubacar',
      'Djibril', 'Idrissa', 'Kwadwo', 'Kofi', 'Mohamed', 'Nabil', 'Pape', 'Seydou',
      'Yaya', 'Adama', 'Bourama', 'Cheikhou', 'Franck', 'Issiaka', 'Karim', 'Moussa',
      'Nicolas', 'Salif', 'Wilfried', 'Yves', 'Aliou', 'Bafode', 'Emmanuel', 'Kelechi',
      'Odion', 'Samuel', 'Victor', 'Wilfred',
    ],
    surnames: [
      'Adebayo', 'Bamba', 'Camara', 'Diallo', 'Diouf', 'Faye', 'Gueye', 'Haidara',
      'Iwobi', 'Jallow', 'Keita', 'Kone', 'Mendy', 'Ndoye', 'Okafor', 'Ouattara',
      'Sarr', 'Sylla', 'Toure', 'Traore', 'Yeboah', 'Zoungrana', 'Aboubakar', 'Baldé',
      'Cisse', 'Dabo', 'Ekong', 'Fofana', 'Gomis', 'Hadjam', 'Jatta', 'Konate',
      'Mbaye', 'Ndidi', 'Obi', 'Partey', 'Sanogo', 'Sow', 'Tchouameni', 'Ugochukwu',
      'Anyanwu', 'Bissouma', 'Dembele', 'Enahoro', 'Kamara', 'Nwaneri', 'Osimhen', 'Sangare',
    ],
  },
  maghrebi: {
    id: 'maghrebi',
    conventions: ['nickname'],
    forenames: [
      'Achraf', 'Bilal', 'Chaker', 'Driss', 'Elyas', 'Farid', 'Hakim', 'Ismail', 'Jamal', 'Karim',
      'Lotfi', 'Mehdi', 'Nabil', 'Omar', 'Rachid', 'Samir', 'Tarik', 'Walid', 'Yassine', 'Zakaria',
      'Adel', 'Brahim', 'Chemsdine', 'Djamel', 'Fouad', 'Hicham', 'Ilyes', 'Khalid',
      'Mounir', 'Nordin', 'Ramy', 'Sofiane', 'Youcef', 'Amine', 'Badr', 'Chafik',
      'Hamza', 'Idriss', 'Marouane', 'Noussair', 'Riyad', 'Selim', 'Yacine', 'Anis',
      'Bilel', 'Ferhat', 'Islam', 'Ryad',
    ],
    surnames: [
      'Amrabat', 'Benatia', 'Chergui', 'Dahmane', 'El Kaabi', 'Feghouli', 'Ghezzal', 'Hakimi',
      'Ihattaren', 'Jebali', 'Khedira', 'Laidouni', 'Mahrez', 'Nasri', 'Ounahi', 'Rahmani',
      'Saiss', 'Taider', 'Ziyech', 'Attal', 'Bennacer', 'Chaibi', 'Delort', 'El Yamiq',
      'Ferhat', 'Guedioura', 'Harit', 'Ismaili', 'Kadri', 'Larbi', 'Mandi', 'Nadir',
      'Ouahabi', 'Rekik', 'Slimani', 'Tannane', 'Zerrouki', 'Aouar', 'Belaili', 'Chetti',
      'Dari', 'Ezzalzouli', 'Guendouzi', 'Hadid', 'Kechrida', 'Msakni', 'Skhiri', 'Zalzouli',
    ],
  },
  japanese: {
    id: 'japanese',
    conventions: ['surnameFirst'],
    forenames: [
      'Akira', 'Daichi', 'Eiji', 'Genki', 'Haruto', 'Itsuki', 'Junya', 'Kaoru', 'Kyogo', 'Makoto',
      'Naoki', 'Osamu', 'Ritsu', 'Shoya', 'Takumi', 'Wataru', 'Yuto', 'Ao', 'Daizen', 'Hidemasa',
      'Kaishu', 'Koki', 'Musashi', 'Reo', 'Sho', 'Takefusa', 'Yukinari', 'Ayase',
      'Hiroki', 'Kota', 'Mao', 'Riku', 'Seiya', 'Tsubasa', 'Yuki', 'Zion',
      'Ren', 'Sota', 'Yamato', 'Kenta', 'Rikuto', 'Shunsuke', 'Taiga', 'Yudai',
      'Hayato', 'Keito', 'Rin', 'Souta',
    ],
    surnames: [
      'Abe', 'Doan', 'Endo', 'Furuhashi', 'Hashioka', 'Ito', 'Kamada', 'Kubo',
      'Maeda', 'Mitoma', 'Morita', 'Nakamura', 'Ogawa', 'Sakai', 'Suzuki', 'Tanaka',
      'Tomiyasu', 'Ueda', 'Watanabe', 'Yamada', 'Asano', 'Chiba', 'Fujita', 'Hasegawa',
      'Inoue', 'Kimura', 'Kobayashi', 'Matsuoka', 'Nagatomo', 'Okazaki', 'Saito', 'Shibasaki',
      'Takahashi', 'Uchida', 'Yamamoto', 'Yoshida', 'Hara', 'Kato', 'Machida', 'Nishimura',
      'Ozaki', 'Sano', 'Sugawara', 'Taniguchi', 'Wakizaka', 'Yano', 'Hatate', 'Iwata',
    ],
  },
  korean: {
    id: 'korean',
    conventions: ['surnameFirst'],
    forenames: [
      'Heung-min', 'Min-jae', 'Kang-in', 'Woo-young', 'Jae-sung', 'Ui-jo', 'Young-gwon', 'Chan-hee', 'Do-hyeon', 'Eun-sang',
      'Gyu-sung', 'Hyeon-woo', 'In-beom', 'Jun-ho', 'Kyung-won', 'Min-hyuk', 'Nam-il', 'Sang-ho',
      'Seung-ho', 'Tae-hwan', 'Woo-jin', 'Ye-chan', 'Young-jun', 'Bo-kyung', 'Chang-hoon', 'Dong-jun',
      'Ga-ram', 'Hyun-jun', 'Ji-soo', 'Kyu-baek', 'Moon-hwan', 'Sang-min', 'Se-jin', 'Tae-seok',
      'Won-sang', 'Yeong-jae', 'Jae-hyun', 'Ki-hun', 'Min-woo', 'Seok-ho', 'Tae-yang', 'Young-woo',
      'Chan-young', 'Doo-hyun', 'Hee-chan', 'Jin-woo', 'Sang-hyeok', 'Yoo-min',
    ],
    surnames: [
      'Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon',
      'Jang', 'Lim', 'Han', 'Oh', 'Seo', 'Shin', 'Kwon', 'Hwang',
      'Ahn', 'Song', 'Hong', 'Yang', 'Ko', 'Moon', 'Son', 'Bae',
      'Baek', 'Heo', 'Nam', 'Sim', 'Woo', 'Ryu', 'Jin', 'Ha',
      'Gu', 'Min', 'No', 'Pyo', 'Sung', 'Tak', 'Um', 'Wi',
      'Yeom', 'Cha', 'Do', 'Gwak', 'Jeon', 'Kwak', 'Na', 'Chun',
    ],
  },
  northAmerican: {
    id: 'northAmerican',
    conventions: ['nickname', 'initialFirst'],
    forenames: [
      'Aidan', 'Brandon', 'Cade', 'Dante', 'Ethan', 'Gio', 'Hunter', 'Isaiah', 'Jaden', 'Kellyn',
      'Landon', 'Malik', 'Nolan', 'Owen', 'Paxten', 'Quinn', 'Ricardo', 'Sebastian', 'Tanner', 'Tyler',
      'Weston', 'Zack', 'Auston', 'Braden', 'Chase', 'Devin', 'Emerson', 'Griffin',
      'Hayden', 'Jackson', 'Kobe', 'Logan', 'Mason', 'Nathan', 'Preston', 'Reid',
      'Shaq', 'Trevor', 'Wyatt', 'Xander', 'Alex', 'Cameron', 'Dillon', 'Grayson',
      'Jonah', 'Kaden', 'Miles', 'Ryder',
    ],
    surnames: [
      'Abbott', 'Bradley', 'Caldwell', 'Delgado', 'Ellsworth', 'Ferguson', 'Grant', 'Holbrook',
      'Ives', 'Jennings', 'Kessler', 'Lockhart', 'Mendez', 'Novak', 'Osborne', 'Pomykal',
      'Ramirez', 'Sargent', 'Turner', 'Vines', 'Whitcomb', 'Yarbrough', 'Blackmon', 'Corbett',
      'Dunlap', 'Everson', 'Fletcher', 'Gaines', 'Hollis', 'Ingram', 'Kirkland', 'Lassiter',
      'Marsh', 'Norwood', 'Prescott', 'Reyna', 'Sheppard', 'Tillman', 'Vaughn', 'Winslow',
      'Aaronson', 'Balogun', 'Cardoso', 'Dest', 'Musah', 'Pepi', 'Richards', 'Weah',
    ],
  },
  mexican: {
    id: 'mexican',
    conventions: ['nickname', 'doubleSurname'],
    forenames: [
      'Alexis', 'Braulio', 'Cesar', 'Diego', 'Edson', 'Fernando', 'Guillermo', 'Hirving', 'Israel', 'Jesus',
      'Kevin', 'Luis', 'Marcelo', 'Nestor', 'Orbelin', 'Pablo', 'Raul', 'Santiago', 'Uriel', 'Victor',
      'Yael', 'Ali', 'Bryan', 'Carlos', 'Erick', 'Gerardo', 'Hector', 'Jorge',
      'Julian', 'Luca', 'Mateo', 'Obed', 'Rodolfo', 'Sebastian', 'Tomas', 'Ximena',
      'Angel', 'Cristian', 'Emilio', 'Gilberto', 'Ignacio', 'Kevin', 'Mauricio', 'Rogelio',
      'Salvador', 'Ulises', 'Vladimir', 'Zahid',
    ],
    surnames: [
      'Alvarado', 'Beltran', 'Cordova', 'Dominguez', 'Espinoza', 'Fuentes', 'Guzman', 'Huerta',
      'Ibarra', 'Jimenez', 'Lainez', 'Montes', 'Nava', 'Ochoa', 'Pineda', 'Quinones',
      'Rodriguez', 'Sepulveda', 'Trejo', 'Uribe', 'Vega', 'Zavala', 'Angulo', 'Bermudez',
      'Cabrera', 'Delgadillo', 'Escobar', 'Flores', 'Gallardo', 'Hernandez', 'Lozano', 'Mendoza',
      'Nunez', 'Orozco', 'Peralta', 'Ramos', 'Salcedo', 'Tapia', 'Villalobos', 'Zamora',
      'Aguirre', 'Cisneros', 'Esquivel', 'Gutierrez', 'Marquez', 'Osuna', 'Sanchez', 'Vasquez',
    ],
  },
  colombian: {
    id: 'colombian',
    conventions: ['nickname', 'doubleSurname'],
    forenames: [
      'Andres', 'Brayan', 'Camilo', 'Duvan', 'Edwin', 'Falcao', 'Gustavo', 'Hernan', 'Ivan', 'Jhon',
      'Kevin', 'Luis', 'Mateo', 'Nelson', 'Oscar', 'Pablo', 'Rafael', 'Santiago', 'Teofilo', 'Wilmar',
      'Yerry', 'Alfredo', 'Bernardo', 'Cristian', 'Daniel', 'Eder', 'Fabian', 'Gabriel',
      'Hector', 'Jefferson', 'Juan', 'Leonardo', 'Miguel', 'Nicolas', 'Orlando', 'Ricardo',
      'Sebastian', 'Wilder', 'Yaser', 'Alexis', 'Deiver', 'Frank', 'Jhonier', 'Luiz',
      'Marino', 'Radamel', 'Steven', 'Yairo',
    ],
    surnames: [
      'Arias', 'Borja', 'Cuadrado', 'Diaz', 'Estupinan', 'Fuentes', 'Gonzalez', 'Hurtado',
      'Izquierdo', 'Jaramillo', 'Lerma', 'Mina', 'Nunez', 'Ospina', 'Preciado', 'Quintero',
      'Rodallega', 'Sanchez', 'Tesillo', 'Uribe', 'Valencia', 'Zapata', 'Angulo', 'Barrios',
      'Castillo', 'Duran', 'Escobar', 'Flores', 'Guarin', 'Hernandez', 'Jimenez', 'Lucumi',
      'Moreno', 'Ortiz', 'Perea', 'Restrepo', 'Suarez', 'Torres', 'Velasquez', 'Yepes',
      'Arboleda', 'Cardona', 'Diaz-Munoz', 'Gomez', 'Mosquera', 'Palacios', 'Renteria', 'Sinisterra',
    ],
  },
  slavic: {
    id: 'slavic',
    conventions: ['nickname'],
    forenames: [
      'Aleksei', 'Bogdan', 'Denys', 'Egor', 'Fedir', 'Georgiy', 'Ihor', 'Kirill', 'Maksym', 'Mykola',
      'Oleksandr', 'Pavlo', 'Roman', 'Serhiy', 'Taras', 'Vadym', 'Yaroslav', 'Andriy', 'Bohdan', 'Dmytro',
      'Eduard', 'Ilya', 'Kostiantyn', 'Mykhailo', 'Oleg', 'Ruslan', 'Stanislav', 'Vitaliy',
      'Volodymyr', 'Yuriy', 'Artem', 'Danylo', 'Hlib', 'Marian', 'Nazar', 'Oleksiy',
      'Petro', 'Sergei', 'Vladyslav', 'Zinovii', 'Anton', 'Borys', 'Illia', 'Mykyta',
      'Oleh', 'Rostyslav', 'Valeriy', 'Yehor',
    ],
    surnames: [
      'Andriyenko', 'Bondarenko', 'Chernov', 'Dovbyk', 'Fedorov', 'Grishchenko', 'Hlushchenko', 'Ivanenko',
      'Kovalenko', 'Lunin', 'Malinovskyi', 'Nesterov', 'Ovcharenko', 'Petrov', 'Romanchuk', 'Shevchenko',
      'Tymoshchuk', 'Vasylenko', 'Yarmolenko', 'Zinchenko', 'Boyko', 'Danylov', 'Filatov', 'Grytsenko',
      'Kharatin', 'Konoplya', 'Lysenko', 'Mudryk', 'Novikov', 'Pavlenko', 'Rebrov', 'Sydorchuk',
      'Tsygankov', 'Volkov', 'Zubkov', 'Bilyi', 'Dubinchak', 'Hutsuliak', 'Kalyuzhnyi', 'Matviyenko',
      'Ponomarenko', 'Sikan', 'Trubin', 'Yaremchuk', 'Zabarnyi', 'Krasnopir', 'Ocheretko', 'Sudakov',
    ],
  },
  swiss: {
    id: 'swiss',
    conventions: ['nickname'],
    forenames: [
      'Adrian', 'Breel', 'Cedric', 'Denis', 'Edimilson', 'Fabian', 'Granit', 'Haris', 'Isaac', 'Julian',
      'Kevin', 'Loris', 'Manuel', 'Noah', 'Oliver', 'Philipp', 'Remo', 'Silvan', 'Timm', 'Vincent',
      'Xherdan', 'Yvon', 'Zeki', 'Andi', 'Becir', 'Cheikh', 'Dan', 'Eray',
      'Fabio', 'Gregor', 'Joel', 'Leonidas', 'Miro', 'Nico', 'Renato', 'Simon',
      'Ulisses', 'Yann', 'Aurele', 'Dereck', 'Filip', 'Johan', 'Michel', 'Ruben',
      'Steven', 'Ardon', 'Bastien', 'Kastriot',
    ],
    surnames: [
      'Akanji', 'Burkart', 'Comert', 'Duah', 'Elvedi', 'Frei', 'Garcia', 'Hefti',
      'Itten', 'Jashari', 'Kobel', 'Lotomba', 'Mvogo', 'Ndoye', 'Omeragic', 'Rieder',
      'Schmid', 'Sow', 'Steffen', 'Vargas', 'Widmer', 'Zesiger', 'Amdouni', 'Bernasconi',
      'Cabral', 'Dahler', 'Fassnacht', 'Gerber', 'Huber', 'Kaufmann', 'Lang', 'Meyer',
      'Nsame', 'Pfeiffer', 'Rohner', 'Stergiou', 'Ugrinic', 'Von Ballmoos', 'Weiler', 'Zeqiri',
      'Aebischer', 'Chiasso', 'Fernandes', 'Kreuzer', 'Lauper', 'Muheim', 'Ruegg', 'Sierro',
    ],
  },
  czech: {
    id: 'czech',
    conventions: ['nickname'],
    forenames: [
      'Adam', 'Bohumil', 'David', 'Filip', 'Jakub', 'Karel', 'Ladislav', 'Martin', 'Ondrej', 'Patrik',
      'Radek', 'Stanislav', 'Tomas', 'Vaclav', 'Zdenek', 'Antonin', 'Daniel', 'Frantisek',
      'Jaroslav', 'Kamil', 'Lukas', 'Michal', 'Pavel', 'Petr', 'Roman', 'Vladimir',
      'Alex', 'Denis', 'Erik', 'Ivan', 'Jindrich', 'Marek', 'Milan', 'Norbert',
      'Oliver', 'Robin', 'Simon', 'Vojtech', 'Dominik', 'Jan', 'Matej', 'Miroslav',
      'Richard', 'Samuel', 'Vitek', 'Bruno', 'Josef', 'Rudolf',
    ],
    surnames: [
      'Barak', 'Coufal', 'Dolezal', 'Fiala', 'Hlozek', 'Jankto', 'Kalvach', 'Krejci',
      'Masopust', 'Novotny', 'Pesek', 'Provod', 'Rehak', 'Soucek', 'Sevcik', 'Trpisovsky',
      'Vlcek', 'Zima', 'Bednarek', 'Cerny', 'Dvorak', 'Havel', 'Jurasek', 'Kopecky',
      'Lingr', 'Mateju', 'Nedved', 'Ostrak', 'Pokorny', 'Rosicky', 'Sadilek', 'Sulc',
      'Vydra', 'Zeleny', 'Blazek', 'Chory', 'Hranac', 'Kuchta', 'Michal', 'Prekop',
      'Sima', 'Tijani', 'Vesely', 'Zafeiris', 'Holes', 'Jemelka', 'Lischka', 'Stanek',
    ],
  },
}

export const POOL_IDS = Object.keys(NAME_POOLS)

/** Brazilian-style diminutives and nickname suffixes. */
export const NICKNAME_SUFFIXES = ['inho', 'ito', 'ao', 'zinho']

/** Short-form nicknames applied to long forenames in Anglo pools. */
export const SHORT_FORMS: Record<string, string> = {
  Alexander: 'Alex',
  Benjamin: 'Ben',
  Christopher: 'Chris',
  Daniel: 'Danny',
  Dominic: 'Dom',
  Edward: 'Eddie',
  Frederick: 'Freddie',
  Jonathan: 'Jonny',
  Joseph: 'Joe',
  Maximilian: 'Max',
  Nathaniel: 'Nate',
  Nicholas: 'Nick',
  Oliver: 'Ollie',
  Patrick: 'Paddy',
  Sebastian: 'Seb',
  Theodore: 'Theo',
  Thomas: 'Tom',
  William: 'Will',
  Zachary: 'Zach',
}
