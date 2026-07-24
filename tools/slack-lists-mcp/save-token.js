import readline from "node:readline";
import { saveToken } from "./src/token.js";

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const rlWithMute = rl;
    rlWithMute._writeToOutput = function hiddenWrite(stringToWrite) {
      if (stringToWrite === question) {
        rlWithMute.output.write(stringToWrite);
      }
    };

    rl.question(question, (answer) => {
      rl.output.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const token = await promptHidden("Slack User OAuth Token (xoxp-...): ");

  if (!token) {
    console.error("토큰이 입력되지 않았습니다. 저장을 취소합니다.");
    process.exitCode = 1;
    return;
  }

  if (!token.startsWith("xoxp-")) {
    console.error(
      "입력된 값이 User Token(xoxp-...) 형식이 아닙니다. Bot Token(xoxb-)이 아닌 User Token을 입력하세요."
    );
    process.exitCode = 1;
    return;
  }

  saveToken(token);
  console.log("Slack User Token이 OS 자격 증명 저장소에 저장되었습니다.");
}

main().catch(() => {
  console.error("토큰 저장 중 오류가 발생했습니다.");
  process.exitCode = 1;
});
