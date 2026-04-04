project 'CodeRed.xcodeproj'

platform :ios, '17.0'

target 'CodeRed' do
  use_frameworks!
  pod 'Firebase/Auth', '~> 10.24.0'
  pod 'Firebase/Firestore', '~> 10.24.0'
  pod 'Firebase/Messaging', '~> 10.24.0'
end

post_install do |installer|
  # Apply C++ standard at project level first
  installer.pods_project.build_configurations.each do |config|
    config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++20'
  end

  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '12.0'
      config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)', 'GRPC_PROHIBIT_G_FLAG=1']
      config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++20'
      config.build_settings['OTHER_CPLUSPLUSFLAGS'] = '$(inherited) -Wno-inconsistent-missing-override'
    end

    # Targeted fix for gRPC-Core template parsing error (basic_seq.h)
    if target.name == 'gRPC-Core'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++20'
        config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] = '$(inherited) -w'
      end
    end

    if target.name == 'BoringSSL-GRPC'
      target.source_build_phase.files.each do |file|
        if file.settings && file.settings['COMPILER_FLAGS']
          flags = file.settings['COMPILER_FLAGS'].split
          flags.reject! { |flag| flag == '-G' || flag == '-GCC_WARN_INHIBIT_ALL_WARNINGS' }
          file.settings['COMPILER_FLAGS'] = flags.join(' ')
        end
      end
    end
  end
end
