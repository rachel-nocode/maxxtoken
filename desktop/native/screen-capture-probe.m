#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <dlfcn.h>

typedef bool (*WatcherPresentFn)(void);

static void printResult(bool supported, const char *level, bool captured, const char *message) {
  NSDictionary *payload = @{
    @"supported": @(supported),
    @"supportLevel": [NSString stringWithUTF8String:level],
    @"captured": @(captured),
    @"message": [NSString stringWithUTF8String:message],
  };
  NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
  fwrite(data.bytes, 1, data.length, stdout);
  fputc('\n', stdout);
}

int main(void) {
  @autoreleasepool {
    void *skyLight = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY | RTLD_LOCAL);
    WatcherPresentFn watcher = NULL;
    if (skyLight) watcher = (WatcherPresentFn)dlsym(skyLight, "SLSIsScreenWatcherPresent");
    if (!watcher) watcher = (WatcherPresentFn)dlsym(RTLD_DEFAULT, "CGSIsScreenWatcherPresent");
    if (watcher) {
      printResult(true, "full", watcher(), "Detects active macOS capture streams.");
      if (skyLight) dlclose(skyLight);
      return 0;
    }

    CFDictionaryRef session = CGSessionCopyCurrentDictionary();
    bool captured = false;
    if (session) {
      CFBooleanRef shared = CFDictionaryGetValue(session, CFSTR("CGSSessionScreenIsShared"));
      captured = shared && CFGetTypeID(shared) == CFBooleanGetTypeID() && CFBooleanGetValue(shared);
      CFRelease(session);
    }
    printResult(false, "limited", captured,
      "Only macOS Screen Sharing sessions can be detected on this system; app capture may not be detected.");
    if (skyLight) dlclose(skyLight);
    return 0;
  }
}
