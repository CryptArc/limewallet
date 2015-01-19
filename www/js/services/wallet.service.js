bit_wallet_services
//Wallet Service
.factory('Wallet', function($translate, $rootScope, $q, ENVIRONMENT, BitShares, ReconnectingWebSocket, MasterKey, Address, Setting, AddressBook) {
    var self = this;

    self.assets = {
      current : {},
      list    : {}
    }

    self.address_book = {};
    self.addresses    = {};

    self.transactions = [];
    self.raw_txs      = {};

    self.timeout = {
      ping    : 0,
      refresh : 0
    };

    self.switchAsset = function(asset_id) {
      self.setDefaultAsset(asset_id);
      Setting.set(Setting.DEFAULT_ASSET, asset_id);
    }

    self.setDefaultAsset = function(asset_id) {
      self.assets.current = self.assets.list[asset_id];
      console.log('setDefaultAsset ' + JSON.stringify(self.assets.current));
    }

    self.ADDRESS_BOOK_CHANGE = 'w-address-book-changed';
    self.NEW_BALANCE         = 'w-new-balance';

    self.emit = function(event_id, event_data) {
      $rootScope.$emit(event_id, event_data);
    }

    self.loadAccountAddresses = function() {
      var deferred = $q.defer();
      Address.all().then(function(addys) {
        angular.forEach(addys, function(addr) {
          addr.balances = {}
          self.addresses[addr.address] = addr;  
        });
        console.log('Account addresses loaded');
        deferred.resolve();
      }, function(err) {
        //DB Error (Address::all)
        deferred.reject(err);
      });
      return deferred.promise;
    };


    self.loadAddressBook = function() {
      var deferred = $q.defer();
      AddressBook.all()
      .then(function(addys) {
        
        addys.forEach(function(addr) {
          console.log('loadAddressBook ' + addr.address + '->' + addr.name);
          self.address_book[addr.address] = addr;
        });

        deferred.resolve();
      },
      function(err) {
        //DB Error (AddressBook::all)
        deferred.reject(err);
      });

      return deferred.promise;
    }

    self.disconnect_count = 0;
    self.connectToBackend = function(backend_url) {
      self.ws = new ReconnectingWebSocket(backend_url);
      self.ws.onopen       = self.onConnectedToBackend;
      self.ws.onmessage    = self.onNotification;
      self.ws.onconnecting = self.onReconnect;
    }

    self.onReconnect = function() {
      disconnect_count++;
    }

    self.onConnectedToBackend = function () {
      console.log('onConnectedToBackend -> mando subscribe');
      self.subscribeToNotifications();
      if( self.disconnect_count > 0 )
        self.refreshBalance();
    };

    self.onNotification = function (event) {
      clearTimeout(self.timeout.ping);
      self.timeout.ping = setTimeout( function() { self.ws.send('ping'); }, 10000);

      if(event.data.indexOf('nb') == 2) {
        //Refresh balance in 100ms, if we get two notifications (Withdraw from two addresses) just refresh once.
        clearTimeout(self.timeout.refresh);
        self.timeout.refresh = setTimeout( function() { self.refreshBalance(); }, 100);
      } 
    }

    self.subscribeToNotifications = function() {
      self.getMasterPubkey().then(function(res) {
        var sub = res.masterPubkey + ':' + res.deriv;
        self.ws.send('sub ' + sub);
      }, function(err) {
        console.log('Unable to subscribe to events:' + err);   
      });
    }

    self.init = function() {
      var deferred = $q.defer();

      self.connectToBackend(ENVIRONMENT.wsurl());

      //Load Assets
      angular.forEach( ENVIRONMENT.assets() , function(asset) {
        asset.amount = 0;
        self.assets.list[asset.id] = asset;
      });

      //Create master key
      self.getMasterPrivKey()
      .then(function() {
        
        //Get default asset
        Setting.get(Setting.DEFAULT_ASSET, ENVIRONMENT.default_asset())
        .then(function(default_asset){
          console.log('Setting::DEFAULT_ASSET ' + JSON.stringify(default_asset));
          self.setDefaultAsset(default_asset.value);

          //Load derived address from masterkey
          self.loadAccountAddresses()
          .then(function() {

            //Load addressbook
            self.loadAddressBook().then(function() {
              deferred.resolve();
            }, function(err) {
              deferred.reject(err); 
            });

          }, function(err) {
            deferred.reject(err);
          });

        }, function(err) {
          deferred.reject(err); 
        });
      
      }, function(err) {
        deferred.reject(err); 
      });

      return deferred.promise;
    }

    self.getMasterPrivKey = function() {

      var deferred = $q.defer();

      MasterKey.get().then(function(masterPrivateKey) {

        if(masterPrivateKey !== undefined) {
          console.log('Wallet::createMasterKey master key present');
          deferred.resolve(masterPrivateKey);
          return;
        }

        BitShares.createMasterKey().then(function(masterPrivateKey){
          BitShares.extractDataFromKey(masterPrivateKey).then(function(keyData){
            MasterKey.store(masterPrivateKey, -1).then(function() {
              Address.create(
                -1, 
                keyData.address, 
                keyData.pubkey, 
                keyData.privkey, 
                true, 
                'main').then(function() {
                  deferred.resolve({key:masterPrivateKey, deriv:-1});  
                },function(err) {
                  //DB Error (Address::create) 
                  deferred.reject(err);
                });
            },
            function(err){ 
              //DB Error (MasterKey::store)
              deferred.reject(err);
            });
          },
          function(err) {
            //Plugin error (BitShares.extractDataFromKey);
            deferred.reject(err); 
          });
        },
        function(err) {
          //Plugin error (BitShares.createMasterKey);
          deferred.reject(err); 
        });

      }, 
      function(err) {
        //DB Error (MasterKey::get)
        deferred.reject(err);
      });

      return deferred.promise;
    }

    self.getMasterPubkey = function() {

      var deferred = $q.defer();
      self.getMasterPrivKey().then(function(masterPrivateKey) {
        BitShares.extendedPublicFromPrivate(masterPrivateKey.key).then(function(extendedPublicKey){
          deferred.resolve({masterPubkey:extendedPublicKey, deriv:masterPrivateKey.deriv});
        }, function(err) {
          deferred.reject(err);  
        })
      }, function(err) {
        deferred.reject(err);    
      });

      return deferred.promise;
    } 
    
    self.refreshBalance = function() {
      var deferred = $q.defer();

      self.getMasterPubkey().then(function(res) {
        BitShares.getBalance(res.masterPubkey+':'+res.deriv).then(function(res) {

          //Update assets balance
          res.balances.forEach(function(bal){
            self.assets.list[bal.asset_id].amount = bal.amount/self.assets.list[bal.asset_id].precision;
            console.log('self.assets.current');
            console.log(self.assets.current);
            self.setDefaultAsset(self.assets.current.id);
          });

          //Update address balance
          angular.forEach(Object.keys(self.addresses), function(addy) {
            if (addy in res.address_balance) {
              self.addresses[addy].balances = res.address_balance[addy];
            }
          });

          //Generate tx list
          self.buildTxList(res, self.assets.current.id);

          console.log(JSON.stringify(self.transactions));

          deferred.resolve();
        }, function(err) {
          deferred.reject(err);
        })
      }, function(err) {
        deferred.reject(err); 
      });

      return deferred.promise;
    };

    self.buildTxList = function(res, asset_id) {

       var tx  = {};
       var txs = [];

       var close_tx = function() {

        var precision = self.assets.current.precision;
        var assets = Object.keys(tx['assets']);
        for(var i=0; i<assets.length; i++) {
           p = {}; 
           p['fee']  = (tx['assets'][assets[i]]['w_amount'] - tx['assets'][assets[i]]['d_amount'])/precision;
           p['sign'] = 0;
           p['date'] = tx['assets'][assets[i]]['timestamp']*1000;
           if(tx['assets'][assets[i]]['i_w']) { 
             p['sign']--;
             p['address'] = tx['assets'][assets[i]]['to'][0];
             p['amount'] = tx['assets'][assets[i]]['my_w_amount']/precision - p['fee'];
           }
           if(tx['assets'][assets[i]]['i_d']) { 
             p['sign']++;
             p['address'] = tx['assets'][assets[i]]['from'][0];
             p['amount'] = tx['assets'][assets[i]]['my_d_amount']/precision;
           }
           if(p['sign'] == 0)
           {
             p['addr_name'] = 'Me';
           }

           if(p['addr_name'] != 'Me')
           {
             if( p['address'] in self.address_book )
              p['addr_name'] = self.address_book[p['address']].name;
             else
              p['addr_name'] = p['address'];
           }
           p['tx_id'] = tx['txid'];
           txs.push(p);
         }
         tx = {};
       }

       console.log(JSON.stringify(res));

       res.operations.forEach(function(o){

         if(o.asset_id != asset_id)
         {
           console.log('me voy xq ' + o.asset_id + '!=' + asset_id);
           return;
         }

         //Esto es para mostrar en el detalle de "renglon"
         //TODO: Pedir por API
         if(!(o.txid in self.raw_txs) )
           self.raw_txs[o.txid] = [];
         self.raw_txs[o.txid].push(o);

         
         if( tx['txid'] !== undefined && tx['txid'] != o.txid ) {
            console.log('mando a cerrar');
            close_tx();
         }

         if( tx['txid'] === undefined || ( tx['assets'] !== undefined && !(o.asset_id in tx['assets']) )  ) {

            console.log('abro');
            
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
            if(o.address in self.addresses) {
              tx['assets'][o.asset_id]['my_w_amount'] += o.amount;
              tx['assets'][o.asset_id]['i_w']          = true;
            } else {
              //TODO: lookup in the address book
              tx['assets'][o.asset_id]['from'].push(o.address);
            }
            
         } else {
            tx['assets'][o.asset_id]['d_amount'] += o.amount
            if(o.address in self.addresses) {
              tx['assets'][o.asset_id]['my_d_amount'] += o.amount
              tx['assets'][o.asset_id]['i_d']          = true;
            } else {
              //TODO: lookup in the address book
              tx['assets'][o.asset_id]['to'].push(o.address)
            }
         }
         
       });

       console.log('salgo del loop con ' + tx['txid']);

       if( tx['txid'] !== undefined) {
         console.log('mando a cerrar');
         close_tx();
       }

       self.transactions=txs;
    }

    return self;
});
