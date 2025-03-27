export default function TermsPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="w-full py-8 sm:py-12 md:py-16 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col items-center space-y-4 sm:space-y-6 text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter">
              Terms of Service
            </h1>
            <p className="mx-auto max-w-[700px] text-sm sm:text-base md:text-lg text-zinc-600 dark:text-zinc-400">
              Please read these terms carefully before using our service
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
                <h2 className="text-xl sm:text-2xl font-bold">1. Acceptance of Terms</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  By accessing or using Farmer Markets, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">2. Description of Service</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Farmer Markets provides a platform for users to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Find and discover local farmers markets</li>
                  <li>Access market information and schedules</li>
                  <li>View market locations on interactive maps</li>
                  <li>Learn about available products and vendors</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">3. User Accounts</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  When creating an account, you agree to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Provide accurate and complete information</li>
                  <li>Maintain the security of your account</li>
                  <li>Accept responsibility for all activities under your account</li>
                  <li>Notify us immediately of any security breaches</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">4. User Conduct</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  You agree not to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Use the service for any illegal purpose</li>
                  <li>Interfere with the service&apos;s operation</li>
                  <li>Attempt to gain unauthorized access</li>
                  <li>Harass or harm other users</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">5. Intellectual Property</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  All content and materials available through our service are protected by intellectual property rights. You may not use, reproduce, or distribute our content without permission.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">6. Disclaimer of Warranties</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  The service is provided &quot;as is&quot; without warranties of any kind. We do not guarantee the accuracy or completeness of market information.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">7. Limitation of Liability</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">8. Changes to Terms</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the new terms on this site.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">9. Contact Information</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  For questions about these Terms of Service, please contact us at:
                </p>
                <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg p-4 sm:p-6">
                  <p className="text-sm sm:text-base font-medium">Farmer Markets</p>
                  <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 mt-2">
                    Email: legal@farmermarkets.app<br />
                    Address: 123 Market Street, Suite 100<br />
                    San Francisco, CA 94105
                  </p>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6">
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