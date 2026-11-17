const units = "瓶盒袋罐包杯桶支片个颗枚件";
const digits = { 零:0, 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
const numberPattern = "[0-9零一二两三四五六七八九十]+";
const maxStock = 1_000_000;

function numberOf(text) {
  if (/^\d+$/.test(text)) return Number(text);
  if (Object.hasOwn(digits, text)) return digits[text];
  const [tens, ones, extra] = text.split("十");
  if (extra === undefined && ones !== undefined && (!tens || Object.hasOwn(digits, tens)) &&
      (!ones || Object.hasOwn(digits, ones))) {
    return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  }
  return NaN;
}

export function parseQuantity(input) {
  const spec = String(input ?? "").normalize("NFKC").replace(/\s/g, "");
  if (new RegExp(`\\d[.]\\d+(?:箱|提|组|[${units}])`).test(spec)) return null;
  const inner = new RegExp(`(${numberPattern})([${units}])`, "g");
  const pack = spec.match(new RegExp(`(?:^|[^0-9零一二两三四五六七八九十])(?:(${numberPattern})(箱|提|组|盒|包|袋))?(?:每(?:箱|提|组|盒|包|袋)(?:含|装)?|[×xX*,:、，]|装)?(${numberPattern})([${units}])(?:装)?(?=$|[×xX*/(),，、;；])`));
  const perUnit = spec.match(new RegExp(`(${numberPattern})([${units}])/(?:箱|提|组|盒|包|袋)$`));
  const direct = [...spec.matchAll(inner)].filter((m) => {
    const following = spec.slice(m.index + m[0].length);
    return !new RegExp(`^${numberPattern}`).test(following);
  });
  if (!pack && !perUnit && direct.length !== 1) return null;
  const amount = perUnit ? numberOf(perUnit[1]) : pack ? numberOf(pack[3]) * (pack[1] ? numberOf(pack[1]) : 1) : numberOf(direct[0][1]);
  const unit = perUnit ? perUnit[2] : pack ? pack[4] : direct[0][2];
  return Number.isSafeInteger(amount) && amount > 0 && amount <= maxStock ? { amount, unit } : null;
}

export function quantityPreview(input, output) {
  const quantity = parseQuantity(input.value);
  output.textContent = quantity ? `该规格共 ${quantity.amount} ${quantity.unit}`
    : input.value.trim() ? "未识别到件数。可输入如 1 箱 × 12 瓶。" : "";
}
