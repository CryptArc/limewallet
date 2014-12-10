// BitWallet

angular.module('bit_wallet', ['ionic', 'ngCordova', 'pascalprecht.translate', 'reconnectingWebSocket', 'bit_wallet.controllers','bit_wallet.services'])

.directive('numberOnlyInput', function () {
    return {
        restrict: 'E',
        template: '<input name="{{inputName}}" ng-model="inputValue" class={{inputClass}} style="display:none;" />',
        scope: {
            inputValue: '=',
            inputName: '='
        },
        link: function (scope) {
            scope.$watch('inputValue', function(newValue,oldValue) {
                var arr = String(newValue).split("");
                if (arr.length === 0) return;
                if (arr.length === 1 && (arr[0] === '.' )) return;
                if (arr.length === 2 && newValue === '.') return;
                if (isNaN(newValue)) {
                    scope.inputValue = oldValue;
                }
            });
        }
    };
})

.run(function(DB, $cordovaGlobalization, $translate, ReconnectingWebSocket, $q, MasterKey, AddressBook, Address, Asset, $http, $rootScope, $ionicPlatform, $cordovaLocalNotification, $cordovaBarcodeScanner, $ionicModal, $ionicPopup, $cordovaSplashscreen, T) {

  $ionicPlatform.ready(function() {
    // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
    // for form inputs)
    if(window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }

    if(window.StatusBar) {
      // org.apache.cordova.statusbar required
      StatusBar.styleDefault();
    }

    $cordovaGlobalization.getPreferredLanguage().then(
      function(lang) {
        console.log('lang ->' + lang.value);
        $translate.use(lang.value.slice(0,2));
      },
      function(error) {
        console.log('Unable to get preferred language');
        $translate.use('en');
      });
    
    //$rootScope.current_balance  = 0;
    $rootScope.asset_id         = 22;
    $rootScope.balance          = {};
    $rootScope.transactions     = [];
    $rootScope.raw_txs          = {};
    $rootScope.my_addresses     = {};
    $rootScope.my_book          = {};
    $rootScope.assets           = {};

    DB.init();
    //Create master key if not exists
    MasterKey.get().then(function(res) {
      if(res === undefined) {

        console.log('creating master key...');

        var hdnode  = bitcoin.HDNode.fromBase58( bitcoin.HDNode.fromSeedBuffer( bitcoin.ECKey.makeRandom().d.toBuffer() ).toString() );
        var privkey = hdnode.privKey;
        var pubkey  = hdnode.pubKey.toBuffer();

        MasterKey.store(hdnode.toString(), -1).then(function() {
          Address.create(
            -1, 
            bitcoin.bts.pub_to_address(pubkey), 
            bitcoin.bts.encode_pubkey(pubkey), 
            privkey.toWIF(), 
            true, 
            'main').then( function() {
              $rootScope.$emit('wallet-changed');
            });
        });
      }
    }, function(err) {
      console.error(err);
    });
    
    //Create assets if not exist, load assets and set default asset.
    Asset.all().then(function(res) {
      if(res === undefined || res.length === 0) {
        console.log('creating assets...');
        Asset.init();
      }
      else{
        console.log('Assets already created.');
      }
    }, function(err) {
      console.error(err);
    })
    .finally(function(data){
      Asset.getDefault().then(function(res){
        $rootScope.asset_id = res.asset_id;
      });
      $rootScope.loadAssets();
    });
    
    $rootScope.loadAssets = function() {
      Asset.all().then(function(assets) {
        assets.forEach(function(asset) {
          $rootScope.assets[asset.asset_id] = asset;  
          $rootScope.balance[asset.asset_id] = 0;  
          console.log('loaded asset: '+ asset.asset_id);
        });
        $rootScope.refreshBalance();
        $rootScope.$emit('assets-loaded');
      });
    };

    $rootScope.loadAddressBook = function() {
      console.log('loadAddressBook IN');
      AddressBook.all().then(function(addys) {
        
        addys.forEach(function(addr) {
          console.log('loadAddressBook ' + addr.address + '->' + addr.name);
          $rootScope.my_book[addr.address] = addr;
        });

        $rootScope.$emit('address-book-changed');
      });
    }

    $rootScope.loadAddressBook();

    $rootScope.loadMyAddresses = function() {
      return Address.all().then(function(addys) {
        
        addys.forEach(function(addr) {
          $rootScope.my_addresses[addr.address] = addr;  
        });
      });
    };

    $rootScope.loadMyAddresses();
    
    $rootScope.refreshBalance = function(show_toast) {
      console.log('resfreshBalance -> IN');

      MasterKey.get().then(function(master_key) {
        if(master_key === undefined)  {
          console.log('resfreshBalance -> no master key!!!');
          return;
        }

        var addr = bitcoin.HDNode.fromBase58(master_key.key).neutered().toString() + ':' + master_key.deriv;
        var url = 'https://bsw.latincoin.com/api/v1/addrs/' + addr + '/balance';
        
        console.log('voy con url: '+url);

        $http.get(url)
        .success(function(r) {
          r.balances.forEach(function(b){
            $rootScope.balance[b.asset_id] = b.amount/$rootScope.assets[b.asset_id].precision ;//1e4; 
            //if(b.asset_id==$rootScope.asset_is)
              //$rootScope.current_balance = $rootScope.balance[b.asset_id];
          });
           
           var tx  = {};
           var txs = [];

           var close_tx = function() {
              
            var assets = Object.keys(tx['assets']);
            for(var i=0; i<assets.length; i++) {
               p = {}; 
               p['fee']  = (tx['assets'][assets[i]]['w_amount'] - tx['assets'][assets[i]]['d_amount'])/1e4;
               p['sign'] = 0;
               p['date'] = tx['assets'][assets[i]]['timestamp']*1000;
               if(tx['assets'][assets[i]]['i_w']) { 
                 p['sign']--;
                 p['address'] = tx['assets'][assets[i]]['to'][0];
                 p['amount'] = tx['assets'][assets[i]]['my_w_amount']/1e4 - p['fee'];
               }
               if(tx['assets'][assets[i]]['i_d']) { 
                 p['sign']++;
                 p['address'] = tx['assets'][assets[i]]['from'][0];
                 p['amount'] = tx['assets'][assets[i]]['my_d_amount']/1e4;
               }
               if(p['sign'] == 0)
               {
                 p['addr_name'] = 'Me';
               }

               if(p['addr_name'] != 'Me')
               {
                 if( p['address'] in $rootScope.my_book )
                  p['addr_name'] = $rootScope.my_book[p['address']].name;
                 else
                  p['addr_name'] = p['address'];
               }
               p['tx_id'] = tx['txid'];
               txs.push(p);
             }
             tx = {};
           }

           r.operations.forEach(function(o){

             //TODO: only USD
             //if(o.asset_id != 22) 
             //  return;

             //Esto es para mostrar en el detalle de "renglon"
             if(!(o.txid in $rootScope.raw_txs) )
               $rootScope.raw_txs[o.txid] = [];
             
             $rootScope.raw_txs[o.txid].push(o);

             
             if( tx['txid'] !== undefined && tx['txid'] != o.txid ) {
                close_tx();
             }

             if( tx['txid'] === undefined || !o.asset_id in tx['assets'] ) {
                
                tx['txid']        = o.txid;
                tx['assets']      = {};
                tx['assets'][o.asset_id] = {
                  'id'          : o.id,
                  'from'        : [],
                  'to'          : [],
                  'w_amount'    : 0,
                  'my_w_amount' : 0,
                  'd_amount'    : 0,
                  'my_d_amount' : 0,
                  'timestamp'   : o.timestamp,
                  'i_w'         : false,
                  'i_d'         : false,
                }
             } 

             if(o.op_type == 'w') { 
                tx['assets'][o.asset_id]['w_amount'] += o.amount
                if(o.address in $rootScope.my_addresses) {
                  tx['assets'][o.asset_id]['my_w_amount'] += o.amount;
                  tx['assets'][o.asset_id]['i_w']          = true;
                } else {
                  //TODO: lookup in the address book
                  tx['assets'][o.asset_id]['from'].push(o.address);
                }
                
             } else {
                tx['assets'][o.asset_id]['d_amount'] += o.amount
                if(o.address in $rootScope.my_addresses) {
                  tx['assets'][o.asset_id]['my_d_amount'] += o.amount
                  tx['assets'][o.asset_id]['i_d']          = true;
                } else {
                  //TODO: lookup in the address book
                  tx['assets'][o.asset_id]['to'].push(o.address)
                }
             }
             
           });

           if( tx['id'] !== undefined) {
             close_tx();
           }
           
           $rootScope.transactions=txs;
           if(show_toast == true)
            window.plugins.toast.show( T.i('g.updated'), 'short', 'bottom');
        })
        .error(function(data, status, headers, config) {
           window.plugins.toast.show( T.i('g.unable_to_refresh'), 'long', 'bottom');
        })
        .finally(function() {
           console.log('RefreshBalance: finally...');
           $rootScope.$emit('refresh-done');
        });

      });

    };

    //$rootScope.refreshBalance();

    $rootScope.subscribe = function() {
      MasterKey.get().then(function(master_key) {
        var sub = bitcoin.HDNode.fromBase58(master_key.key).neutered().toString() + ':' + master_key.deriv;
        $rootScope.ws.send('sub ' + sub);
      });
    }

    $rootScope.ws = new ReconnectingWebSocket('wss://bswws.latincoin.com/events');

    $rootScope.$on('wallet-changed', function() {
      $rootScope.loadMyAddresses();
      $rootScope.refreshBalance();
      $rootScope.subscribe();
    });

    $rootScope.$on('new-balance', function(data) {
      $rootScope.refreshBalance();
    });

    $rootScope.ws.onopen = function () {
      console.log('ONOPEN -> mando subscribe');
      $rootScope.subscribe();
    };

    $rootScope.ws.onmessage = function (event) {
      clearTimeout($rootScope.tid);
      $rootScope.tid = setTimeout( function() { $rootScope.ws.send('ping'); }, 10000);

      if(event.data.indexOf('nb') == 2) {
        //Refresh balance in 500ms, if we get two notifications (Withdraw from two addresses) just refresh once.
        clearTimeout($rootScope.rid);
        $rootScope.rid = setTimeout( function() { $rootScope.$emit('new-balance', event.data); }, 500);
      } 
    };
    
    // Creo que es al pedo, pero por las dudas cerramos el splash.
    setTimeout(function() {
      $cordovaSplashscreen.hide()
    }, 1000);
    
    // FullScreen Config
    var showFullScreen = false, showStatusBar = true;
    ionic.Platform.fullScreen(showFullScreen, showStatusBar);


  });
})

.config(function($stateProvider, $urlRouterProvider, $translateProvider) {

  $translateProvider.useStaticFilesLoader({ prefix: 'static/locale-', suffix: '.json'});

  $stateProvider
    .state('app', {
      url: "/app",
      abstract: true,
      templateUrl: "templates/menu.html",
      controller: 'AppCtrl'
    })

    .state('app.backup', {
      url: "/settings/backup",
      views: {
        'menuContent' :{
          templateUrl: "templates/settings.backup.html",
          controller: 'BackupCtrl'
        }
      }
    })
    
    .state('app.restore', {
      url: "/settings/restore",
      views: {
        'menuContent' :{
          templateUrl: "templates/settings.restore.html",
          controller: 'RestoreCtrl'
        }
      }
    })
    
    .state('app.account', {
      url: "/settings/account",
      views: {
        'menuContent' :{
          templateUrl: "templates/settings.account.html",
          controller: 'AccountCtrl'
        }
      }
    })
    
    .state('app.assets', {
      url: "/settings/assets",
      views: {
        'menuContent' :{
          templateUrl: "templates/settings.assets.html",
          controller: 'AssetsCtrl'
        }
      }
    })
    
    .state('app.receive', {
      url: "/receive",
      views: {
        'menuContent' :{
          templateUrl: "templates/receive.html",
          controller: 'ReceiveCtrl'
        }
      }
    })
    
    .state('app.receive_qrcode', {
      url: "/receive/qrcode/:address/:amount",
      views: {
        'menuContent' :{
          templateUrl: "templates/receive.qrcode.html",
          controller: 'ReceiveQrcodeCtrl'
        }
      }
    })
    
    .state('app.send', {
      url: "/send/:address/:amount",
      views: {
        'menuContent' :{
          templateUrl: "templates/send.html",
          controller: 'SendCtrl'
        }
      }
    })
    
    .state('app.transaction_details', {
      url: "/transaction/:tx_id",
      views: {
        'menuContent' :{
          templateUrl: "templates/transaction.html",
          controller: 'TxCtrl'
        }
      }
    })

    .state('app.address_book', {
      url: "/address_book",
      views: {
        'menuContent' :{
          templateUrl: "templates/settings.addressbook.html",
          controller: 'AddressBookCtrl'
        }
      }
    })
    
    .state('app.import_priv', {
      url: "/import_priv/:private_key",
      views: {
        'menuContent' :{
          templateUrl: "templates/import_priv.html",
          controller: 'ImportPrivCtrl'
        }
      }
    })
    
    .state('app.home', {
      url: "/home",
      views: {
        'menuContent' :{
          templateUrl: "templates/home.html",
          controller: 'HomeCtrl'
        }
      }
    })

  // if none of the above states are matched, use this as the fallback
  $urlRouterProvider.otherwise('/app/home');
});
