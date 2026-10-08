// Reads a streamed response where every line is one JSON object, for example:
//   {"type":"text","text":"Revenue was "}
//   {"type":"text","text":"$4.20M (p. 2)"}
//   {"type":"usage","inputTokens":3120, ...}
// and calls onEvent(object) for each line as soon as it arrives.
export async function readJsonLines(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let leftover = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // A chunk from the network can end in the middle of a line.
    // So we split into lines and keep the last, possibly unfinished, piece for next time.
    const lines = (leftover + decoder.decode(value, { stream: true })).split("\n");
    leftover = lines.pop();

    for (const line of lines) {
      if (line.trim() !== "") onEvent(JSON.parse(line));
    }
  }
}
