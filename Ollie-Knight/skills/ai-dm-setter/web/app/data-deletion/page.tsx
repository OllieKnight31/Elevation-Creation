import type { Metadata } from "next";

export const metadata: Metadata = { title: "Data deletion | Ainable Setter" };

// Public page. Its address is given to Meta as the app's "Data deletion instructions URL". Shown without signing in.
export default function DataDeletion() {
  return (
    <main className="max-w-[720px] mx-auto px-4 py-10 text-[14.5px] leading-relaxed text-ink2 space-y-4">
      <h1 className="text-[26px] font-semibold text-ink">Deleting your data from Ainable Setter</h1>
      <p className="text-mute text-[13px]">Last updated 16 October 2026</p>
      <p>Ainable Setter keeps a business&apos;s own Instagram direct messages so its team can reply to them. It holds the other person&apos;s name, username, profile picture and the messages in the chat. See the <a className="underline" href="/privacy">privacy page</a> for what is kept and why.</p>
      <h2 className="text-[17px] font-semibold text-ink pt-2">If you messaged a business that uses Ainable Setter</h2>
      <p>Send that business a direct message on Instagram asking them to delete your data. In Ainable Setter they open your conversation and delete it, which removes your messages, details and history at once. It is done within 30 days of your request.</p>
      <h2 className="text-[17px] font-semibold text-ink pt-2">If you are the business</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>To delete one conversation: open it in Ainable Setter and delete it.</li>
        <li>To disconnect Instagram: go to Get connected and disconnect. Ainable Setter stops receiving messages at once and the access Meta gave it is removed. You can also remove the app in Instagram under Settings, Website permissions, Apps and websites.</li>
        <li>To delete everything: ask the person who gave you access to Ainable Setter, and all data for the account is deleted within 30 days.</li>
      </ul>
    </main>
  );
}
