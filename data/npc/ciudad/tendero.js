'use strict';

/**
 * El tendero.
 *
 * Es el otro extremo del comercio. El herrero FABRICA: vende lo que forja por encargo y
 * compra lo que puede volver a la fragua. El tendero REVENDE: compra lo que los
 * aventureros se sacan de encima y lo vuelve a poner en el mostrador. De ahi salen sus dos
 * diferencias con el herrero, y las dos son a proposito:
 *
 *   - El anillo lo vende MAS CARO, porque el herrero lo forja y el tendero lo ha tenido
 *     que comprar antes a alguien.
 *   - Y sobre todo lo COMPRA, que es justo lo que el herrero no hace: al herrero no le
 *     interesan las joyas, y un anillo que no se puede vender en ningun sitio es basura
 *     con peso.
 *
 * UNA TIENDA NO PUEDE TENER MAS GENERO DEL QUE HAY. Cada entrada de `shop.items` es un id
 * de `data/items/items.xml`, y ese catalogo hoy define cuatro cosas comerciables: las dos
 * monedas, la espada y el anillo. Poner aqui "pan" o "pocion" obligaria a inventarse un id,
 * y `buyFromNpc` lo rechazaria con `unknownItem` (mira `engine/world/world.js`), asi que el
 * jugador veria una tienda que ofrece cosas que no puede comprar. Una tienda corta y de
 * verdad vale mas que una larga y rota: el dia que items.xml tenga comida y pociones, se
 * anaden aqui y ya esta.
 *
 * LOS PRECIOS SON DE ESTE MUNDO, NO DE TIBIA. Los unicos numeros que se copian de Tibia en
 * este repositorio son los del catalogo —pesos, ataque, defensa—, y estan en items.xml. Lo
 * que un mercader cobra es una decision de contenido, y aqui se elige que deje margen: paga
 * menos de lo que cobra, para que revender no sea un negocio.
 *
 * DIBUJO: el del aspecto (`lookType`) en `client/jetyum/assets/things.json`.
 */
const TIENDA = {
    items: [
        // El anillo: lo compra y lo vende. Paga 1200 y cobra 3400, que es el margen de
        // cualquier revendedor; sigue siendo mas caro que el herrero (3000) porque el
        // herrero lo hace y este lo ha tenido que comprar.
        { id: 2376, buy: 3400, sell: 1200, name: 'anillo' },

        // Lo de cada día: pociones, comida, el arco y sus flechas, la antorcha y la cuerda.
        // Se ve todo en la ventana de comercio (di «comerciar» a su lado).
        { id: 2413, buy: 50, sell: 20, name: 'pocion de vida' },
        { id: 2414, buy: 55, sell: 20, name: 'pocion de mana' },
        { id: 2415, buy: 5, sell: 2, name: 'carne' },
        { id: 12181, buy: 8, sell: 4, name: 'jamon' },
        { id: 12183, buy: 6, sell: 2, name: 'queso' },
        { id: 12177, buy: 3, sell: 1, name: 'manzana' },
        { id: 2404, buy: 400, sell: 100, name: 'arco' },
        { id: 12138, buy: 3, sell: 1, name: 'flecha' },
        { id: 11892, buy: 42, sell: 15, name: 'estrella arrojadiza' },
        { id: 2417, buy: 2, sell: 1, name: 'antorcha' },
        { id: 12137, buy: 50, sell: 8, name: 'cuerda' },
        { id: 12166, sell: 2, name: 'hueso' },
        { id: 12207, sell: 250, name: 'zafiro pequeno' },
        { id: 12211, sell: 250, name: 'rubi pequeno' },
        { id: 12213, sell: 250, name: 'esmeralda pequena' },
        { id: 12215, sell: 200, name: 'amatista pequena' },
        { id: 12219, sell: 300, name: 'diamante pequeno' }
    ]
};

module.exports = {

    type: 'npc',
    name: 'Tendero',

    shop: TIENDA,

    default: (npc) => {
        npc.say('No te entiendo. Dime "comerciar" y te enseño todo lo que tengo, o "ofrezco" ' +
            'para oírlo.');
    },

    keywords: [
        {
            // «comerciar» (o «trade», «tienda») abre además la VENTANA de comercio: el motor la
            // abre sola junto a cualquier NPC con tienda.
            words: ['comerciar', 'trade', 'tienda'],
            say: (npc) => {
                npc.say('Mira lo que tengo.');
            }
        },
        {
            words: ['hola', 'hi', 'buenas', 'buenos dias'],
            greeting: true,
            say: (npc, player) => {
                // `getName()` Y NO `player.name`. El envoltorio que recibe el dialogo expone
                // el nombre como METODO; la propiedad `name` no esta en el. Con
                // `player.name` esto saludaria con un "Buenas, undefined", que es
                // exactamente lo que le pasa al saludo de `ciudad/guia.js`.
                npc.say('Buenas, ' + player.getName() + '. Compro lo que te sobre y vendo lo que ' +
                    'me traen. Dime "comerciar" para verlo.');
            }
        },

        {
            // El listado. Se separa lo que VENDE de lo que COMPRA porque son dos listas
            // distintas y confundirlas hace que el jugador no sepa que puede hacer aqui.
            words: ['ofrezco', 'ofreces', 'tienes', 'mercancia'],
            say: (npc, player) => {
                const list = npc.shopList();
                const vende = list.filter((entry) => entry.buy > 0);
                const compra = list.filter((entry) => entry.sell > 0);

                if (vende.length > 0) {
                    npc.say('Tengo a la venta:');
                    vende.forEach((entry) => {
                        npc.say('  ' + entry.name + ': ' + entry.buy + ' monedas');
                    });
                }

                if (compra.length > 0) {
                    npc.say('Y te compro:');
                    compra.forEach((entry) => {
                        npc.say('  ' + entry.name + ': ' + entry.sell + ' monedas');
                    });
                }

                if (vende.length === 0 && compra.length === 0) {
                    npc.say('Hoy no tengo nada que ofrecerte.');
                    return;
                }

                npc.say('Llevas ' + player.getMoney() + ' monedas encima.');
            }
        },

        {
            // COMPRAR va antes de las palabras concretas ("anillo") a proposito: quien
            // escribe "comprar anillo" quiere comprar, no que le cuenten la historia del
            // anillo, y gana la PRIMERA palabra clave que casa.
            words: ['comprar', 'buy', 'quiero'],
            say: (npc, player, words) => {
                const result = npc.buyFor(player, words);

                if (result.ok) {
                    npc.say('Aqui tienes ' + result.count + 'x ' + result.offer.name +
                        '. Te he cobrado ' + result.total + ' monedas.');
                    return;
                }

                // Un motivo por mensaje, igual que en el herrero: "no puedes" a secas
                // obliga al jugador a adivinar si le falta dinero, si no lo vendo o si no
                // le cabe, y son tres cosas que se arreglan de tres maneras distintas.
                if (result.reason === 'notSold') {
                    npc.say('Eso no lo vendo. Dime "ofrezco" para ver lo que tengo.');
                } else if (result.reason === 'notEnoughMoney') {
                    npc.say('No te llega: cuesta ' + result.price + ' y llevas ' +
                        result.money + '.');
                } else if (result.reason === 'backpackFull') {
                    npc.say('No te cabe: tu mochila esta llena. Haz hueco y vuelve.');
                } else if (result.reason === 'tooHeavy') {
                    // No se dan numeros de peso aqui a proposito: el envoltorio formatea el
                    // peso total, pero no el de la carga libre, y dividir entre cien desde
                    // el contenido es justo lo que la API existe para evitar.
                    npc.say('No te cabe encima: vas demasiado cargado. Suelta algo y vuelve.');
                } else if (result.reason === 'unknownItem') {
                    // Esto no deberia pasar nunca: significa que la tienda ofrece un id
                    // que items.xml no define. Se dice tal cual, porque es un fallo de
                    // contenido y callarlo lo dejaria escondido.
                    npc.say('Eso esta en mi lista pero no existe. Avisa de este fallo.');
                } else {
                    npc.say('No he podido hacer la compra.');
                }
            }
        },

        {
            words: ['vender', 'sell'],
            say: (npc, player, words) => {
                const result = npc.sellFor(player, words);

                if (result.ok) {
                    npc.say('Te doy ' + result.total + ' monedas por ' +
                        result.count + 'x ' + result.offer.name + '.');
                    return;
                }

                if (result.reason === 'notBought') {
                    npc.say('Eso no lo compro.');
                } else if (result.reason === 'notOwned') {
                    npc.say('No llevas eso encima.');
                } else {
                    npc.say('No he podido hacer la venta.');
                }
            }
        },

        {
            // Concreta, asi que va DESPUES de "comprar" y "vender" pero ANTES de la
            // generica de dinero: quien pregunta por el anillo quiere saber del anillo.
            words: ['anillo', 'anillos', 'joyas', 'joya'],
            say: (npc) => {
                npc.say('Anillos compro todos los que me traigas. El herrero no te los ' +
                    'cogera: dice que el hierro si y el oro no.');
            }
        },

        {
            // La moneda de cristal va ANTES que la palabra generica de dinero por el mismo
            // motivo: "cuanto me das por las monedas de cristal" es una pregunta concreta,
            // y con la generica delante contestaria el saldo y no el precio.
            words: ['cristal', 'moneda de cristal', 'crystal', 'crystal coin'],
            say: (npc) => {
                npc.say('La moneda de cristal te la pago a 100 de oro. Es lo que sueltan ' +
                    'las ratas del charco, y por aqui no la quiere nadie mas.');
            }
        },

        {
            words: ['dinero', 'monedas', 'oro'],
            say: (npc, player) => {
                npc.say('Llevas ' + player.getMoney() + ' monedas de oro encima.');
            }
        },

        {
            words: ['peso', 'carga', 'capacidad', 'espacio'],
            say: (npc, player) => {
                npc.say('Vas cargado con ' + player.getWeightText() + ' de ' +
                    player.getCapacityText() + '. Lo que no te quepa no te lo puedo vender.');
            }
        },

        {
            words: ['trabajo', 'haces', 'oficio'],
            say: (npc) => {
                npc.say('Compro barato y vendo caro. Si te parece mal, prueba a forjar tu ' +
                    'el anillo.');
            }
        },

        {
            words: ['adios', 'bye', 'chao', 'hasta luego'],
            farewell: true,
            say: (npc) => {
                npc.say('Vuelve cuando tengas algo que soltar.');
            }
        }
    ]
};
