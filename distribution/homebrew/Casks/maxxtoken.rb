cask "maxxtoken" do
  version "0.2.13"
  sha256 "857d691ed90e3ada93d0ddeb648862d9ad8449c64ac2b228c4255fe4c3dfc6cb"

  url "https://github.com/rachel-nocode/maxxtoken/releases/download/v#{version}/MaxxToken-#{version}-universal.dmg"
  name "MaxxToken"
  desc "Menu bar tracker for AI subscription usage"
  homepage "https://maxxtoken.app/"

  auto_updates true
  depends_on macos: :monterey

  app "MaxxToken.app"
end
