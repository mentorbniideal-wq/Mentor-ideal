import { canEditOwnedGuidedData, cleanGuidedText, elapsedGuidedSeconds, normalizeGuidedContent, recommendedGuidedMode, validGuidedStep } from './guided-one-to-one.ts';
const eq=(actual:unknown,expected:unknown)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);};

Deno.test('guided mode uses Discover for a new relationship', () => eq(recommendedGuidedMode(0), 'discover'));
Deno.test('guided mode uses Deepen for repeat relationships', () => eq(recommendedGuidedMode(2), 'deepen'));
Deno.test('guided step rejects invalid positions', () => { eq(validGuidedStep(-1), 0); eq(validGuidedStep(6), 6); eq(validGuidedStep(7), 0); });
Deno.test('guided text strips control characters and limits length', () => eq(cleanGuidedText('  A\u0000B  ', 2), 'AB'));
Deno.test('guided content drops unknown and oversized fields', () => { const out=normalizeGuidedContent({stepNotes:{a:'ok'},secret:'no',sharedSummary:'x'.repeat(30001)}); eq(out,{stepNotes:{a:'ok'}}); });
Deno.test('only the owner participant edits owned data', () => { eq(canEditOwnedGuidedData('a','a',['a','b']),true); eq(canEditOwnedGuidedData('a','b',['a','b']),false); eq(canEditOwnedGuidedData('x','x',['a','b']),false); });
Deno.test('elapsed timer never becomes negative', () => { eq(elapsedGuidedSeconds('2026-01-01T00:00:00Z',Date.parse('2026-01-01T00:00:05Z')),5); eq(elapsedGuidedSeconds('bad'),0); });
