export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="prose prose-zinc dark:prose-invert max-w-none
          prose-headings:font-bold
          prose-h1:text-4xl prose-h1:text-gray-900 dark:prose-h1:text-white prose-h1:mb-6 prose-h1:border-b prose-h1:border-zinc-200 dark:prose-h1:border-white/10 prose-h1:pb-4
          prose-h2:text-2xl prose-h2:text-gray-900 dark:prose-h2:text-white prose-h2:mt-12 prose-h2:mb-4 prose-h2:border-b prose-h2:border-zinc-100 dark:prose-h2:border-white/5 prose-h2:pb-2
          prose-h3:text-xl prose-h3:text-gray-900 dark:prose-h3:text-white prose-h3:mt-8 prose-h3:mb-3
          prose-p:text-zinc-600 dark:prose-p:text-zinc-400 prose-p:leading-relaxed
          prose-a:text-sangria-400 prose-a:no-underline hover:prose-a:text-sangria-300
          prose-code:text-sangria-400 prose-code:bg-zinc-100 dark:prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-200 dark:prose-pre:border-white/5 prose-pre:rounded-xl
          prose-strong:text-gray-900 dark:prose-strong:text-white prose-strong:font-semibold
          prose-ul:text-zinc-600 dark:prose-ul:text-zinc-400 prose-ol:text-zinc-600 dark:prose-ol:text-zinc-400
          prose-li:my-1
          prose-table:text-sm
          prose-th:text-gray-900 dark:prose-th:text-white prose-th:bg-zinc-100 dark:prose-th:bg-zinc-900 prose-th:border prose-th:border-zinc-200 dark:prose-th:border-white/10
          prose-td:border prose-td:border-zinc-200 dark:prose-td:border-white/5
          prose-blockquote:border-l-sangria-500 prose-blockquote:bg-sangria-500/5 prose-blockquote:py-1 prose-blockquote:text-zinc-700 dark:prose-blockquote:text-zinc-300
        ">
          {children}
        </div>
      </div>
    </div>
  );
}
