export default function PrivacyPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="w-full py-8 sm:py-12 md:py-16 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col items-center space-y-4 sm:space-y-6 text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter">
              Privacy Policy
            </h1>
            <p className="mx-auto max-w-[700px] text-sm sm:text-base md:text-lg text-zinc-600 dark:text-zinc-400">
              Learn how we protect your privacy and handle your data
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="w-full py-8 sm:py-12 md:py-16 bg-white dark:bg-zinc-900">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6">
          <div className="prose prose-zinc dark:prose-invert max-w-none">
            <div className="space-y-8 sm:space-y-12">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Information We Collect</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We collect information that you provide directly to us, including:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Name and contact information when you create an account</li>
                  <li>Location data to show you nearby farmers markets</li>
                  <li>Search history and preferences to improve recommendations</li>
                  <li>Device information and usage statistics</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">How We Use Your Information</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We use the information we collect to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Provide and improve our services</li>
                  <li>Personalize your experience</li>
                  <li>Send you updates about markets you follow</li>
                  <li>Analyze usage patterns and optimize performance</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Data Security</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We take the security of your data seriously and implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Cookies and Tracking</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We use cookies and similar tracking technologies to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Remember your preferences</li>
                  <li>Analyze site traffic and usage</li>
                  <li>Improve our services</li>
                  <li>Provide personalized content</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Your Rights</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  You have the right to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Access your personal data</li>
                  <li>Request correction of inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Opt-out of marketing communications</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Contact Us</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  If you have any questions about our Privacy Policy, please contact us at:
                </p>
                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-4 sm:p-6">
                  <p className="text-sm sm:text-base font-medium">Farmer Markets</p>
                  <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-2">
                    Email: privacy@farmermarkets.app<br />
                    Address: 123 Market Street, Suite 100<br />
                    San Francisco, CA 94105
                  </p>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Updates to This Policy</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last Updated&quot; date below.
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Last Updated: March 15, 2024
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
} 