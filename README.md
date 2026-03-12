> [!important] AI Usage Disclaimer
> Due to my lack of skill in  programming with TS, I have used AI to do the following:
> 1. Use the data from the code snippet OpenMeteo.TS to create a summary
> 2. Set up TS (i.e. dist, node_modules, etc.)
> 3. Code the logic I specified in TS for ClothesListGen; PrefMatching.TS; ClothesToOutfits.ts; UiCli.TS; Startup.cmd; tsconfig.json
> 
> I have also used AI to speed up the execution of the following tasks:
> 1. Formulate the clothing database
> 2. Setup both config files
> 
> I have used AI to do tasks that I believed were beyond my current capability, and to do tasks that I could have done but would have taken too long.
> However, I promise you that I will improve in both programming and TS, so that I can make this sort of thing without needing AI. I enjoyed trying to learn about TS, despite my heavy use of AI.

> [!note] Commands To Run
> `npm run build` to start off
> `npm run weather:update` to update the om_summary.json from current weather data
> `npx tsx Utils\ClothesListGen` to pull up the full list of clothes
> `npm run ui` to launch the polished CLI layout

# Layer Scale (0-4)
0: Thermal underlayers/underwear (includes socks; often empty)
1: Main garments (t-shirts, tops, pants, etc.)
2: Mid layer (waistcoats, vests, light jumpers)
3: Outer layer (shoes, footwear, jackets, coats)
4: Accessories (hats, masks, etc.)

# Design Brief
Problem 2: SkyWardrobe (Real-Time Weather Advisor)
This challenge requires you to build a lifestyle utility service that bridges the gap between live environmental data and daily user needs. You will create an application that fetches real-time weather metrics and processes them through a custom logic engine to provide context-aware clothing recommendations for the user.
Core Requirements:
Data Integration: Fetch live weather data (temperature, humidity, precipitation) from a public API like OpenWeatherMap.
Recommendation Engine: Map weather states to a local dataset (JSON or Database) of clothing items to generate a logical "Outfit of the Day."
Resiliency: Implement a fallback strategy for when the third-party API is unreachable or rate-limited.
Key things to note:
How you define the thresholds for specific weather categories (e.g., "cold" vs. "chilly").

# NOTES FOR FUTURE ME:
1. ~~Warmth stacks with layers.~~ DONE
    ~~- Take the average of the upper and lower clothes to get the warmth of one layer.~~
    ~~- Then add all layers together to get the total warmth.~~
    ~~- So if the max and min temp are in different bands:~~
        ~~- Have it such that the outermost layer is the one that matches the max warmth band; ~~
        ~~- and the innermost layer is the one that matches the min warmth band.~~
2. Breathability stacks with layers, in much the same manner.
3.~~ Windchill prevention does not stack. ~~ DONE
    ~~- Take the max of all clothes to get the total windchill prevention.~~
4.~~ Water resistance does not stack. ~~ DONE
    ~~- Same as windchill prevention~~

# Future additions:
~~- Initialiser kinda thing to start off the program and run the right lines~~ DONE
~~- CLI UI~~ DONE
- GUI
- Allow user to modify database and preferences through the UI, and save those changes to the files
- Graphics for the clothing items, and use those in the UI
- Use the complements property to match clothes
- Use Formality to filter
- Add a 'vibe' property to the clothing items
