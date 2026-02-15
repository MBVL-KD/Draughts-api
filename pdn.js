// pdn.js

function gameTypeForVariant(variant) {
  switch (variant) {
    case "International": return "20";
    case "Brazilian": return "26";
    case "Turkish": return "30";
    default: return "20";
  }
}

function generatePDN(game) {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");

  const tags = {
    Event: "Kid Draughts",
    Site: "Roblox",
    Date: `${yyyy}.${mm}.${dd}`,
    Round: "?",
    White: game.white?.display || "White",
    Black: game.black?.display || "Black",
    Result: game.result || "*",
    GameType: gameTypeForVariant(game.variant || "International"),
  };

  let movetext = "";
  let moveNo = 1;
  const moves = game.moves || [];

  for (let i = 0; i < moves.length; i += 2) {
    const w = moves[i];
    const b = moves[i + 1];
    if (!w?.notation) break;

    movetext += `${moveNo}. ${w.notation}`;
    if (b?.notation) movetext += ` ${b.notation}`;
    movetext += " ";
    moveNo++;
  }

  movetext += tags.Result;

  const tagText = Object.entries(tags)
    .map(([k, v]) => `[${k} "${v}"]`)
    .join("\n");

  return {
    tags,
    text: `${tagText}\n\n${movetext}`.trim(),
  };
}

module.exports = { generatePDN };
