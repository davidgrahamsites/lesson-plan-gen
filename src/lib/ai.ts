import Tesseract from 'tesseract.js';

export const OCRProcessor = async (file: File) => {
    const result = await Tesseract.recognize(file, 'eng', {
        logger: m => console.log(m)
    });
    return result.data.text;
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
    You are a strict data formatter for a lesson plan. You are NOT a creative writer.
    
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

    CRITICAL RULES - READ CAREFULLY:
    1. EXTREME LITERALISM. If a specific activity (like "Weather", "Calendar", "Greeting") is not in the source text, DO NOT INCLUDE IT.
    2. ABSOLUTELY NO "FILLER". Do not add "Discuss the weather", "Sing a goodbye song", "Clean up", or "Take attendance".
    3. INTRODUCTION FORMAT: STRICTLY: "Sing ${context.song} -> Review: ${context.spiralReview.oldest} / ${context.spiralReview.recent}". 
       - IF THE SONG IS "Song of the Week" (default), just say "Sing Song -> Review...".
       - DO NOT ADD ANYTHING ELSE TO INTRODUCTION.
    4. GAME SECTION: Paste the Literal Game Name and Description. Do not summarize.
    5. CLOSURE: Max 1 sentence reflecting on the Learning Targets.
    
    OUTPUT FORMAT (JSON ONLY):
    {
      "activityName": "WEEK X [DAY] - [SUBJECT]",
      "objectives": "LITERAL List of Learning Targets. COPY EXACTLY.",
      "materials": "Concise list based ONLY on Game/Activity.",
      "introduction": "Sing ${context.song} -> Review: ${context.spiralReview.oldest} / ${context.spiralReview.recent}",
      "activity": "Max 3 short steps based ONLY on Learning Targets.",
      "game": "LITERAL Name\\nLITERAL Description",
      "closure": "Short review of targets."
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
