source "https://rubygems.org"

# Modern Jekyll. We deploy via GitHub Actions (not classic Pages), so
# local, CI, and production all build from this exact Gemfile.lock.
gem "jekyll", "~> 4.4"

group :jekyll_plugins do
  gem "jekyll-sitemap"
end

# Local preview server.
gem "webrick"

# Windows / JRuby timezone data (harmless elsewhere).
gem "tzinfo-data", platforms: [:windows, :jruby]
