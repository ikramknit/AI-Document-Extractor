import { GoogleGenAI } from "@google/genai";
import type { Part } from "@google/genai";

// Fix: Use process.env.API_KEY as per coding guidelines. The original code used import.meta.env which caused a TypeScript error and violated guidelines.
const apiKey = process.env.API_KEY;

if (!apiKey) {
  // Fix: Updated error message to reference API_KEY.
  throw new Error("API_KEY environment variable is not set. Please add it to your project settings.");
}

const ai = new GoogleGenAI({ apiKey });
const model = "gemini-2.5-flash";

export async function identifyHeadersFromFiles(
  fileParts: Part[]
): Promise<string[]> {
  const prompt = `You are an expert at analyzing documents.
Analyze the provided documents (images or PDFs) and identify all possible unique column headers or data fields that could be extracted.
Think about what kind of information is present and what would make sense as columns in a structured table.
Return a single JSON array of strings, where each string is a suggested header.
Example response: ["Invoice Number", "Date", "Total Amount", "Customer Name", "Line Item Description"]
Do not include any other text or markdown formatting. The response must be only the JSON array.`;

  const contents = { parts: [{ text: prompt }, ...fileParts] };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text.trim();
    // The Gemini API might wrap the JSON in markdown, so we strip it.
    const jsonString = text.replace(/^```json\s*/, '').replace(/```$/, '');
    const headers = JSON.parse(jsonString);
    return Array.isArray(headers) ? headers : [];
  } catch (error) {
    console.error("Error identifying headers:", error);
    throw new Error("Failed to communicate with the AI. Please check your API key and network connection. The AI may have returned an unexpected format.");
  }
}

export async function extractInfoFromSingleFile(
  headers: string[],
  userPrompt: string,
  filePart: Part
): Promise<string> {
  const prompt = `You are an expert at data extraction from documents.
From the provided document (image or PDF), extract the information corresponding to the following JSON keys: ${JSON.stringify(headers)}.
The user has provided these additional instructions: "${userPrompt || 'None'}".
If a value for a key cannot be found in the document, return null for that key.
Your response MUST be a single, valid JSON object with the specified keys, and nothing else. Do not include markdown formatting.`;

  const contents = { parts: [{ text: prompt }, filePart] };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: contents,
      config: {
        responseMimeType: "application/json",
      },
    });
    
    const text = response.text.trim();
    // The Gemini API might wrap the JSON in markdown, so we strip it.
    const jsonString = text.replace(/^```json\s*/, '').replace(/```$/, '');
    // We expect a JSON object, so let's quickly validate.
    JSON.parse(jsonString);
    return jsonString;
  } catch (error: any) {
    console.error("Error extracting data:", error);
    if (error.message && error.message.includes('JSON')) {
        throw new Error("The AI returned an invalid data format. Please try again.");
    }
    throw new Error("Failed to extract data from the document. Please check the AI service status.");
  }
}

export async function testApiKey(): Promise<{ success: boolean; error?: string }> {
  try {
    // A simple, fast, and cheap call to test connectivity and authentication.
    await ai.models.generateContent({
      model: model,
      contents: "hello",
    });
    return { success: true };
  } catch (error: any) {
    console.error("API Key test failed:", error);
    let errorMessage = "An unknown error occurred.";
    if (error && error.message) {
      // Extract a more user-friendly error message
      if (error.message.includes('API key not valid')) {
        errorMessage = 'The provided API Key is not valid. Please check it and try again.';
      } else if (error.message.includes('fetch')) {
        errorMessage = 'A network error occurred. Please check your connection.';
      } else {
        errorMessage = error.message;
      }
    }
    return { success: false, error: errorMessage };
  }
}
