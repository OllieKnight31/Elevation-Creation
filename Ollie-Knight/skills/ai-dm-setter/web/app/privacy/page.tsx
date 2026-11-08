import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy | Ainable Setter" };

// Public page, linked from the helper's Chrome Web Store listing. Shown without signing in.
export default function Privacy() {
  return (
    <main className="max-w-[720px] mx-auto px-4 py-10 text-[14.5px] leading-relaxed text-ink2 space-y-4">
      <h1 className="text-[26px] font-semibold text-ink">Privacy: Ainable Setter and its Chrome helper</h1>
      <p className="text-mute text-[13px]">Last updated 16 October 2026</p>
      <p>Ainable Setter is an appointment setter for a business&apos;s own Instagram inbox. The Ainable Setter Helper is the Chrome add on that connects that inbox to the business&apos;s Ainable Setter account. This page explains what the helper reads, where it goes and what is never done with it.</p>
      <h2 className="text-[17px] font-semibold text-ink pt-2">What the helper reads</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>The Instagram username signed in to Chrome, so the app knows which account it is working for.</li>
        <li>Direct message threads in that account&apos;s own Instagram and Meta Business Suite inbox, while those pages are open: the other person&apos;s name and handle, and the messages in the thread.</li>
        <li>Nothing else. It does not read other websites, browsing history, passwords or payment details. Your Instagram password is only ever typed on Instagram.</li>
      </ul>
      <h2 className="text-[17px] font-semibold text-ink pt-2">Where it goes</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Only to the Ainable Setter account the helper is linked to, over an encrypted connection, where the business&apos;s team uses it to manage leads and draft replies.</li>
        <li>If the business switches on AI replies, message text is sent to the AI provider to write a suggested reply. It is not used to train AI models.</li>
        <li>If the business switches on the Google Sheets archive, leads and messages are copied into a spreadsheet in the business&apos;s own Google account.</li>
      </ul>
      <h2 className="text-[17px] font-semibold text-ink pt-2">What the helper does</h2>
      <p>It shows the app&apos;s suggested reply and labels inside the inbox. If the business switches on outreach, which is off by default, it types and sends the first messages the business has queued, from the business&apos;s own account, in its own tab and at a set pace.</p>
      <h2 className="text-[17px] font-semibold text-ink pt-2">The Instagram connection through Meta</h2>
      <p>A business can instead connect its Instagram professional account through Meta&apos;s official Instagram API, by signing in with Instagram and granting the permissions it asks for. Ainable Setter then receives the direct messages sent to and from that account, the other person&apos;s name, username and profile picture, and comments on the account&apos;s posts, and can send replies from that account. It uses these only to run that business&apos;s inbox. The business can disconnect at any time on the Get connected screen or in Instagram&apos;s settings. How to have data deleted is on the <a className="underline" href="/data-deletion">data deletion page</a>.</p>
      <h2 className="text-[17px] font-semibold text-ink pt-2">What is never done</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Data is never sold, rented or shared for advertising.</li>
        <li>Data is never used for anything other than running the business&apos;s inbox, nor to judge creditworthiness or for lending.</li>
      </ul>
      <h2 className="text-[17px] font-semibold text-ink pt-2">Keeping and removing data</h2>
      <p>Data stays in the business&apos;s account until the business deletes it. Removing the helper from Chrome stops all reading at once. To have your messages removed, contact the business you were messaging, or the person who gave you access to Ainable Setter.</p>
    </main>
  );
}
