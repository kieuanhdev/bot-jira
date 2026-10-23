import { describe, expect, it } from "vitest";
import { duplicateKey, looksSystemLevel, titleKey } from "./fixability";

describe("looksSystemLevel", () => {
  it("flags ANR and finalizer timeouts", () => {
    expect(looksSystemLevel({ title: "ApplicationNotResponding: ANR for at least 5000 ms.", culprit: "java.lang.Object in wait" })).toBe(true);
    expect(looksSystemLevel({ title: "TimeoutException: android.hardware.camera2.impl.CameraCaptureSessionImpl.finalize() timed out after 60 seconds", culprit: null })).toBe(true);
  });
  it("flags OS-level culprits", () => {
    expect(looksSystemLevel({ title: "x", culprit: "syscall" })).toBe(true);
    expect(looksSystemLevel({ title: "x", culprit: "android.os.Looper in loop" })).toBe(true);
  });
  it("flags failures whose cause is outside the app", () => {
    for (const title of [
      "HTTPClientError: HTTP Client Error with status code: 502",
      "DioException: DioException [bad response]: This exception was thrown because",
      "FirebaseException: [cloud_firestore/permission-denied] The caller does not have permission",
      "OSError: OS Error: No space left on device, errno = 28",
      "PlatformException: PlatformException(TASK_FAILURE, -9: Install Error(-9): T",
      "LocationServiceDisabledException: The location service on the device is disabled",
      "_Exception: Exception: test",
    ]) {
      expect(looksSystemLevel({ title, culprit: "x" })).toBe(true);
    }
  });
  it("keeps errors that point into the app", () => {
    expect(looksSystemLevel({ title: "TypeError: type 'ContractMasterCtrl' is not a subtype", culprit: "get_instance.dart in GetInstance.find" })).toBe(false);
    expect(looksSystemLevel({ title: "CameraException(Uninitialized CameraController)", culprit: "transaction.timekeeping_duration" })).toBe(false);
  });
});

describe("duplicateKey", () => {
  it("is equal for the same title and culprit regardless of case and spacing", () => {
    expect(duplicateKey({ title: "TypeError:  X", culprit: "A in b" })).toBe(duplicateKey({ title: "typeerror: x", culprit: "a in B" }));
  });
  it("differs when the culprit differs", () => {
    expect(duplicateKey({ title: "t", culprit: "a" })).not.toBe(duplicateKey({ title: "t", culprit: "b" }));
  });
});

describe("titleKey", () => {
  it("ignores the culprit so one error kind from many call sites shares a key", () => {
    const a = { title: "TypeError: type 'Null' is not a subtype of type 'Map<String, dynamic>'", culprit: "home_repository.dart" };
    const b = { title: "TypeError:  type 'Null' is not a subtype of type 'Map<String, dynamic>'", culprit: "notification_repository.dart" };
    expect(titleKey(a)).toBe(titleKey(b));
  });
});

describe("App Hanging", () => {
  it("is treated as system-level", () => {
    expect(looksSystemLevel({ title: "App Hanging: App hanging for at least 2000 ms.", culprit: null })).toBe(true);
  });
});
