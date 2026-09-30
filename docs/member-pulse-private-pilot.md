# Member Pulse private pilot

The regular Chapter Pulse policy remains disabled. This pilot does not send
initial invitations or reminders. Typing `Pulse` in the LINE chat only returns
a LIFF link; it is **not** an authorization secret. The LIFF API checks the
verified LINE-linked `member_id`, its Chapter, and
`member_pulse_pilot_access.enabled` on every read and submit.

Chapter Admin setup in Growth Desktop → Member Growth → Member Pulse:

1. Search for the member's current name or nickname (for Pete, Phitarn
   Sakulthanaphetch / ตูมตาม). Select the record and verify the displayed
   member before pressing **เปิดให้ทดลอง**. The database stores the stable
   member ID, not the name.
2. On that linked LINE account, send `Pulse` to MY IDEAL and open the returned
   LIFF link. Submit the short pilot questionnaire. Reopening shows the
   completed state, without creating a second campaign.
3. Use **ปิดสิทธิ์ทดลอง** to revoke access. This preserves audit and responses;
   it does not erase submissions or create another attempt on re-enable.

Migration `20260930000006_member_pulse_private_pilot.sql` creates the allowlist
and versioned pilot template. It does not enable the normal scheduler or LINE
delivery. Apply migrations before deploying code that reads the new table.
Only complete signed-in, linked-member acceptance and authorization checks
before enabling the pilot in Production. A live LINE reply to the keyword is
an external message and should be tested on Pete's own account first.

Intentional debt: the private pilot is a single attempt (`pilot:v1`) per member.
Future normal Pulse templates, policy activation and broader automation remain
separate rollout decisions; the pilot template is inactive for normal
scheduling. Multi-Chapter LINE token/secret migration remains parked.
