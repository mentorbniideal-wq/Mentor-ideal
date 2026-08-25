import { canAccessPairProfile, member121ProfileCompleteness, member121ProfileMissingFields, normalizeMember121Profile, publicMember121Profile } from './member-121-profile.ts';
const eq=(actual:unknown,expected:unknown)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error(`${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);};

Deno.test('member 121 profile strips unknown fields and limits text',()=>{
  const profile=normalizeMember121Profile({business_summary:'x'.repeat(2200),secret:'no'});
  eq(String(profile.business_summary).length,2000);eq('secret' in profile,false);eq(profile.share_networks,false);
});

Deno.test('partner projection respects section visibility',()=>{
  const profile=publicMember121Profile({member_id:'M1',profile_version:2,share_business:true,share_referral_focus:true,share_networks:false,business_summary:'ธุรกิจ',looking_for:'ร้านอาหาร',gains_networks:'รายชื่อลูกค้า'});
  eq(profile?.business_summary,'ธุรกิจ');eq(profile?.looking_for,'ร้านอาหาร');eq('gains_networks' in (profile||{}),false);
});

Deno.test('profile completeness uses the ten useful conversation fields',()=>{
  eq(member121ProfileCompleteness({business_summary:'a',target_clients:'b',problems_solved:'c',looking_for:'d',ideal_client:'e'}),50);
  eq(member121ProfileCompleteness(Object.fromEntries(['business_summary','target_clients','problems_solved','looking_for','ideal_client','referral_trigger','introduction_script','gains_goals','gains_interests','gains_skills'].map(x=>[x,'yes']))),100);
});

Deno.test('profile missing fields returns only incomplete essentials',()=>{
  eq(member121ProfileMissingFields({business_summary:'พร้อม',looking_for:'ต้องการคู่ค้า'}).length,8);
  eq(member121ProfileMissingFields(Object.fromEntries(['business_summary','target_clients','problems_solved','looking_for','ideal_client','referral_trigger','introduction_script','gains_goals','gains_interests','gains_skills'].map(x=>[x,'พร้อม']))),[]);
});

Deno.test('pair profile access requires actor and subject in the same pair',()=>{
  const pair={member_a_id:'A',member_b_id:'B'};eq(canAccessPairProfile('A',pair,'B'),true);eq(canAccessPairProfile('C',pair,'B'),false);eq(canAccessPairProfile('A',pair,'C'),false);
});
