import Tesseract from 'tesseract.js';

export const OCRProcessor = async (file: File) => {
    const result = await Tesseract.recognize(file, 'eng', {
        logger: m => console.log(m)
    });
    // Return structured words with spatial data
    return result.data.words.map(w => ({
        text: w.text,
        bbox: w.bbox
    }));
};

export const AISynthesizer = async (
    gameDesc: string,
    learningTargets: string,
    provider: 'openai' | 'gemini',
    apiKey: string
) => {
    const prompt = `
    You are an educational assistant. 
    Modify the following game description to incorporate the specific learning targets for the day.
    
    Original Game Description:
    "${gameDesc}"
    
    Learning Targets for the day:
    "${learningTargets}"
    
    Instructions:
    - Keep the core mechanics of the game.
    - Replace generic placeholders (like [skill], [topic], etc.) with the actual learning targets.
    - The output should be the modified game description only.
  `;

    if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(`OpenAI Error: ${data.error.message}`);
        if (!data.choices?.[0]) throw new Error("OpenAI returned an empty response.");
        return data.choices[0].message.content;
    } else {
        // Gemini implementation
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(`Gemini Error: ${data.error.message}`);
        if (!data.candidates?.[0]) throw new Error("Gemini returned an empty response. This might be due to safety filters.");
        return data.candidates[0].content.parts[0].text;
    }
};
export const AdvancedLessonPlanSynthesizer = async (
    context: {
        day: string;
        subject: string;
        targets: string;
        gameName: string;
        gameDescription: string;
        spiralReview: { oldest: string; recent: string };
        song: string;
        teacherName: string;
        className: string;
    },
    provider: 'openai' | 'gemini',
    apiKey: string
) => {
    const prompt = `
    You are a professional ESL curriculum developer. Generate a precise and thorough lesson plan based STRICTLY on the provided context.
    
    CONTEXT:
    Day: ${context.day}
    Subject: ${context.subject}
    Learning Targets: ${context.targets}
    Game Name: ${context.gameName}
    Game Description (LITERAL): ${context.gameDescription}
    Spiral Review (Oldest): ${context.spiralReview.oldest}
    Spiral Review (Recent): ${context.spiralReview.recent}
    Song of the Week: ${context.song}
    Teacher: ${context.teacherName}
    Class: ${context.className}

    STRUCTURE & CONTENT RULES:
    1. OBJECTIVES & CATEGORIES: 
       - USE LITERAL HEADERS from the Learning Targets. If targets say "Fall Unit:", YOUR section MUST say "Fall Unit".
       - DO NOT rename categories (e.g. don't change "Fall Unit" to "Plants").
       - Form specific bullet points using the literal Learning Targets.
    
    2. MATERIALS:
       - LIST MATERIALS based on the LITERAL category names.
       - If targets list vocabulary (e.g. "bee, ant, leaf" under "Fall Unit"), list them as "Fall Unit cards: [words]".
       - DO NOT INFER CATEGORIES. Use what is written in the Mind Map.

    3. PROCESS (WITH TIMINGS):
       - Introduction (5 minutes):
         * Sing ${context.song}.
         * Sentence Review: Use the Spiral Review items (${context.spiralReview.oldest} and ${context.spiralReview.recent}). Format: "[Question] -> [Answer options]".
       - Activity (8 minutes):
         * Thoroughly break down the Learning Targets (${context.targets}).
         * List the specific questions and answers for each target category.
       - Game (8 minutes):
         * literal ${context.gameName}.
         * literal ${context.gameDescription}.
         * CAUTION: DO NOT invent game mechanics. If the provided description is generic (e.g. "Educational game based on curriculum targets"), just state the game name and that it should be played using the learning targets.
       - Closure (4 minutes):
         * 3 specific steps for wrap-up based on targets.

    STYLE RULES:
    - NO BOLDING.
    - NO FILLER (No "Discuss the weather", "Take attendance", etc.).
    - METADATA FILTER: ABSOLUTELY IGNORE any mention of "Small Group", "Slime Mats", "Mobile Craft", "Claw Pickup", or "Horse" unless they are core vocabulary in the Mind Map.
    - Professional, clean, and literal.

    OUTPUT FORMAT (JSON ONLY):
    {
      "activityName": "WEEK X [DAY] - [SUBJECT]",
      "objectives": "• Bullet point 1\\n• Bullet point 2",
      "materials": "• Category 1: items\\n• Category 2: items",
      "introduction": "• Sing [Song]\\n• Sentence Review:\\n[Literal Review Text]",
      "activity": "Detailed steps including literal targets.",
      "game": "${context.gameName} (${context.gameDescription})",
      "closure": "• Step 1\\n• Step 2"
    }
  `;

    const getResponse = async (p: string) => {
        if (provider === 'openai') {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{ role: 'user', content: p }],
                    response_format: { type: "json_object" }
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(`OpenAI Error: ${data.error.message}`);
            return data.choices[0].message.content;
        } else {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: p }] }]
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(`Gemini Error: ${data.error.message}`);
            // Gemini flash doesn't always support json mode as cleanly, but we'll try to parse it.
            let text = data.candidates[0].content.parts[0].text;
            // Strip markdown block if present
            if (text.includes('```json')) {
                text = text.split('```json')[1].split('```')[0].trim();
            } else if (text.includes('```')) {
                text = text.split('```')[1].split('```')[0].trim();
            }
            return text;
        }
    };

    const resultText = await getResponse(prompt);
    try {
        return JSON.parse(resultText);
    } catch (e) {
        console.error("Failed to parse AI JSON:", resultText);
        throw new Error("AI returned an invalid JSON format. Please try again.");
    }
};
