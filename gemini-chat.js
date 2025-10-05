
import * as dotenv from "dotenv";
dotenv.config();

import {ChatGoogleGenerativeAI} from "@langchain/google-genai";
import {ChatPromptTemplate, MessagesPlaceholder} from "@langchain/core/prompts";
import {LLMChain} from "langchain/chains";
import {BufferMemory} from "langchain/memory";
import * as readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";

const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  temperature: 0.7,
});

const prompt = ChatPromptTemplate.fromMessages([["system", "Você é um assistente prestativo chamado Gema."], new MessagesPlaceholder("chat_history"),["human", "{input}"],]);

const memory = new BufferMemory({memoryKey: "chat_history", returnMessages: true});

const chain = new LLMChain({
  llm: model,
  prompt: prompt,
  memory: memory,
});

startChat();

async function startChat() {
  const rl = readline.createInterface({ input, output });
  console.log("Chat iniciado! (Digite 'sair' para terminar)");

  const shutdown = () => {
    try {
      rl.close();
    } catch {}
    process.exit(0); 
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    while (true) {
      const userInput = await rl.question("Fala meu cumpade: ");

      if (userInput.toLowerCase() === "sair") {
        console.log("Até mais!");
        shutdown();
        break;
      }

      try {
        const response = await chain.invoke({ input: userInput });
        console.log(`Gema: ${response.text}`);
      } catch (err) {
        console.error("Falha ao gerar resposta:", err?.message ?? err);
      }
    }
  } finally {
    shutdown();
  }
}