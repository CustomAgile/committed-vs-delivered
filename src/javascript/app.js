/* global Ext Rally Constants Utils */
Ext.define("committed-vs-delivered", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    items: [
        {
            xtype: 'tabpanel',
            itemId: 'filterAndSettingsPanel',
            header: false,
            collapsible: true,
            animCollapse: false,
            cls: 'blue-tabs',
            activeTab: 0,
            plain: true,
            tabBar: {
                margin: '0 0 0 100'
            },
            autoRender: true,
            minTabWidth: 140,
            items: [
                {
                    title: 'Filters',
                    html: '',
                    itemId: 'filtersTab',
                    padding: 5,
                    items: [
                        {
                            id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
                            xtype: 'container',
                            layout: {
                                type: 'hbox',
                                align: 'middle',
                                defaultMargins: '0 10 10 0',
                            }
                        }, {
                            id: Utils.AncestorPiAppFilter.PANEL_RENDER_AREA_ID,
                            xtype: 'container',
                            layout: {
                                type: 'hbox',
                                align: 'middle',
                                defaultMargins: '0 10 10 0',
                            }
                        },
                    ]
                },
                {
                    title: 'Settings',
                    html: '',
                    itemId: 'settingsTab',
                    padding: 10,
                },
                {
                    title: 'Projects',
                    itemId: 'projectsTab',
                    padding: 10,
                }
            ]
        },
        {
            xtype: 'container',
            itemId: 'controls-area',
            layout: 'hbox',
            margin: '10 0 0 0'
        },
        {
            id: 'grid-area',
            xtype: 'container',
            flex: 1,
            type: 'vbox',
            align: 'stretch'
        }
    ],
    config: {
        defaultSettings: {
            artifactType: 'HierarchicalRequirement',
            timeboxType: Constants.TIMEBOX_TYPE_ITERATION,
            timeboxCount: 3,
            planningWindow: 2,
            currentTimebox: true,
            respectTimeboxFilteredPage: false
        }
    },

    integrationHeaders: {
        name: "committed-vs-delivered"
    },

    currentData: [],

    launch: async function () {
        Rally.data.wsapi.Proxy.superclass.timeout = 180000;
        Rally.data.wsapi.batch.Proxy.superclass.timeout = 180000;
        this.labelWidth = 240;

        this.down('#grid-area').on('resize', this.resizeChart, this);

        this.loading = true;

        this.collapseBtn = Ext.widget('rallybutton', {
            // xtype: 'rallybutton',
            text: 'Collapse',
            floating: true,
            shadow: false,
            height: 21,
            handler: (btn) => {
                this.down('#filterAndSettingsPanel').toggleCollapse();
                if (btn.getText() === 'Collapse') {
                    btn.setText('Expand');
                }
                else {
                    btn.setText('Collapse');
                }
            }
        });

        this.collapseBtn.showBy(this.down('#filterAndSettingsPanel'), 'tl-tl', [0, 3]);

        this.addSettingItems();
        this.addProjectPicker();

        this.down('#' + Utils.AncestorPiAppFilter.RENDER_AREA_ID).add({
            xtype: 'rallybutton',
            itemId: 'applyFiltersBtn',
            handler: () => this.applyFilters(),
            text: 'Apply filters',
            cls: 'apply-filters-button',
            disabled: true
        });

        this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
            ptype: 'UtilsAncestorPiAppFilter',
            pluginId: 'ancestorFilterPlugin',
            settingsConfig: { labelWidth: this.labelWidth },
            whiteListFields: ['Tags', 'Milestones', 'c_EnterpriseApprovalEA', 'c_EAEpic', 'DisplayColor'],
            filtersHidden: false,
            projectScope: 'current',
            displayMultiLevelFilter: true,
            visibleTab: this.down('#artifactTypeCombo').getValue(),
            listeners: {
                scope: this,
                ready(plugin) {
                    Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
                        scope: this,
                        success(portfolioItemTypes) {
                            this.portfolioItemTypes = _.sortBy(portfolioItemTypes, function (type) {
                                return type.get('Ordinal');
                            });
                            this.lowestPiType = this.portfolioItemTypes[0];
                            this.setModelFieldsForType(this.down('#artifactTypeCombo').getValue());
                            this.setTimeboxFieldsForType(this.down('#timeboxTypeCombo').getValue());

                            plugin.addListener({
                                scope: this,
                                select: this.filtersChange,
                                change: this.filtersChange
                            });

                            this.updateFilterTabText(plugin.getMultiLevelFilters());

                            this.loading = false;
                            this.applyFilters();
                        },
                        failure(msg) {
                            this.showError(msg);
                        },
                    });
                },
            }
        });
        this.addPlugin(this.ancestorFilterPlugin);
    },


    onTimeboxScopeChange: function () {
        this.callParent(arguments);
        this.viewChange();
    },

    filtersChange: function (filters) {
        this.down('#applyFiltersBtn').enable();
        this.updateFilterTabText(filters);
    },

    applyFilters: async function () {
        this.ancestorAndMultiFilters = await this.ancestorFilterPlugin.getAllFiltersForType(this.down('#artifactTypeCombo').getValue(), true).catch((e) => {
            Rally.ui.notify.Notifier.showError({ message: (e.message || e) });
        });

        if (this.ancestorAndMultiFilters) {
            this.viewChange();
        }
    },

    setModelFieldsForType: function (artifactType) {
        this.modelName = artifactType;
        this.acceptedDateField = 'AcceptedDate';
        if (this.isPiTypeSelected()) {
            this.acceptedDateField = 'ActualEndDate'
        }
    },

    setTimeboxFieldsForType: function (timeboxType) {
        this.timeboxType = timeboxType;

        if (this.timeboxType == Constants.TIMEBOX_TYPE_RELEASE) {
            this.timeboxStartDateField = 'ReleaseStartDate';
            this.timeboxEndDateField = 'ReleaseDate';
        }
        else if (this.timeboxType == Constants.TIMEBOX_TYPE_ITERATION) {
            this.timeboxStartDateField = 'StartDate';
            this.timeboxEndDateField = 'EndDate'
        }
    },

    /**
     * Return a promise that resolves once the controls are initialized and
     * have initial values
     */
    addControls: function () {
        // var filterDeferred = Ext.create('Deft.Deferred');
        var context = this.getContext();
        var controlsArea = this.down('#controls-area');
        controlsArea.removeAll();
        controlsArea.add([
            {
                xtype: 'container',
                flex: 1
            }, {
                xtype: 'tsfieldpickerbutton',
                margin: '0 10 0 0',
                toolTipConfig: {
                    html: 'Columns to Export',
                    anchor: 'top'
                },
                getTitle: function () {
                    return 'Export Columns';
                },
                modelNames: [this.modelName],
                _fields: this.isPiTypeSelected() ? Constants.PI_DEFAULT_FIELDS : Constants.STORY_DEFAULT_FIELDS,
                context: context,
                stateful: true,
                stateId: context.getScopedStateId(this.modelName + 'fields'), // columns specific to type of object
                // Always need the accepted date field
                alwaysSelectedValues: Constants.ALWAYS_SELECTED_FIELDS.concat(this.acceptedDateField),
                listeners: {
                    fieldsupdated: function (fields) {
                        this.viewChange();
                    },
                    scope: this
                }
            }, {
                xtype: 'rallybutton',
                style: { 'float': 'right' },
                cls: 'secondary rly-small',
                frame: false,
                itemId: 'actions-menu-button',
                iconCls: 'icon-export',
                listeners: {
                    click: function (button) {
                        var menu = Ext.widget({
                            xtype: 'rallymenu',
                            items: [{
                                text: 'Export to CSV...',
                                handler: function () {
                                    var csvText = this.convertDataArrayToCSVText(this.currentData, this.getExportFieldsHash());
                                    CArABU.technicalservices.FileUtilities.saveCSVToFile(csvText, 'committed.csv');
                                },
                                scope: this
                            }]
                        });
                        menu.showBy(button.getEl());
                        if (button.toolTip) {
                            button.toolTip.hide();
                        }
                    },
                    scope: this
                }
            }]);
    },

    convertDataArrayToCSVText: function (data_array, requestedFieldHash) {
        var text = '';
        var csv = [];
        let header = [];
        Ext.each(Object.keys(requestedFieldHash), function (key) {
            text += requestedFieldHash[key] + ',';
            header.push(requestedFieldHash[key]);
        });
        text = text.replace(/,$/, '\n');
        csv.push(header);

        Ext.each(data_array, function (d) {
            let row = [];
            Ext.each(Object.keys(requestedFieldHash), function (key) {
                row.push(CustomAgile.ui.renderer.RecordFieldRendererFactory.getFieldDisplayValue(d, key, '; ', true));
                // if (d[key]) {
                //     let val = CustomAgile.ui.renderer.RecordFieldRendererFactory.getFieldDisplayValue(d, key, '; ');
                //     text += Ext.String.format("\"{0}\",", val);
                // }
                // else {
                //     text += ',';
                // }
            }, this);
            csv.push(row);
            text = text.replace(/,$/, '\n');
        }, this);
        return Papa.unparse(csv);
        return text;
    },

    getFieldsFromButton: function () {
        var fieldPicker = this.down('tsfieldpickerbutton');
        var result = [];
        if (fieldPicker) {
            result = fieldPicker.getFields();
        }
        return result;
    },

    getExportFieldsHash: function () {
        var fields = this.getFieldsFromButton();
        // Special case, add the accepted date after all fields from the field picker so it
        // is next to the derirved fields instead of in the first column of export.
        // Use _.unique to remove duplicate as that field is also always selected.
        fields = _.without(fields, this.acceptedDateField);
        fields.push(this.acceptedDateField);
        fields = fields.concat(Constants.DERIVED_FIELDS);
        return _.reduce(fields, function (accum, field) {
            accum[field] = this.headerName(field);
            return accum;
        }, {}, this);
    },

    headerName: function (field) {
        var result;
        switch (field) {
            case "Iteration":
                result = 'Currently linked to Iteration'
                break;
            case "Release":
                result = 'Currently linked to Release'
                break;
            case 'timeboxName':
                result = this.timeboxType;
                break;
            case 'timeboxStartDate':
                result = this.timeboxType + ' Start Date';
                break;
            case 'timeboxEndDate':
                result = this.timeboxType + ' End Date';
                break;
            case 'timeboxAddedDate':
                result = 'Linked to ' + this.timeboxType + ' on';
                break;
            default:
                result = field;
        }

        return result;
    },

    // Usual monkey business to size gridboards
    resizeChart: function () {
        // this.callParent(arguments);
        var gridArea = this.down('#grid-area');
        var gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight())
        }
    },

    _buildChartConfig: function (status) {
        // Get the last N timeboxes
        this.setLoading('Loading Timeboxes...');
        return this.getTimeboxes().then({
            scope: this,
            success: function (timeboxGroups) {
                if (status.cancelLoad) {
                    return;
                }

                if (!Object.keys(timeboxGroups).length) {
                    this.showError('Failed to find timeboxes within the specified projects');
                    this.setLoading(false);
                    return;
                }

                this.setLoading('Loading Historical Data...');

                var promises = _.map(timeboxGroups, function (timeboxGroup) {
                    var timebox = timeboxGroup[0]; // Representative timebox for the group
                    var planningWindowEndIso = Ext.Date.add(timebox.get(this.timeboxStartDateField), Ext.Date.DAY, this.down('#planningWindowInput').getValue()).toISOString();
                    var timeboxEndIso = timebox.get(this.timeboxEndDateField).toISOString();
                    var timeboxStartIso = timebox.get(this.timeboxStartDateField).toISOString();
                    var snapshotByOid = {}
                    return this.getSnapshotsFromTimeboxGroup(timeboxGroup).then({
                        scope: this,
                        success: function (snapshots) {
                            if (status.cancelLoad) {
                                return;
                            }

                            if (!snapshots || snapshots.length === 0) {
                                return {
                                    timebox: timebox,
                                    artifacts: []
                                }
                            }
                            else {
                                snapshots = _.flatten(snapshots);

                                if (snapshots.length === 0) {
                                    return {
                                        timebox: timebox,
                                        artifacts: []
                                    }
                                }

                                var oidQueries = [];
                                _.each(snapshots, function (snapshot) {
                                    let oid = snapshot.get('ObjectID');
                                    oidQueries.push(snapshot.get('ObjectID'));
                                    snapshotByOid[oid] = snapshot;
                                }, this);

                                // We can't get other data like accepted date
                                // as part of the planned/unplanned lookback query because then we'd have
                                // to compress potentially many snapshots on the client side.
                                var filters = new Rally.data.wsapi.Filter({
                                    property: 'ObjectID',
                                    operator: 'in',
                                    value: oidQueries
                                });

                                if (this.ancestorAndMultiFilters && this.ancestorAndMultiFilters.length) {
                                    filters = filters.and(Rally.data.wsapi.Filter.and(this.ancestorAndMultiFilters));
                                }

                                var timeboxScope = this.getContext().getTimeboxScope();
                                if (timeboxScope && this.down('#respectTimeboxFilteredPageCheckbox').getValue()) {
                                    if (timeboxScope.type === 'iteration' && this.modelName === 'PortfolioItem/Feature') { }
                                    else {
                                        filters = filters.and(timeboxScope.getQueryFilter());
                                    }
                                }

                                let dataContext = this.getContext().getDataContext();
                                let promises = [];
                                let fetch = this.getFieldsFromButton();

                                if (this.searchAllProjects()) {
                                    dataContext.project = null;
                                }
                                if (this.useSpecificProjects()) {
                                    dataContext.project = null;
                                    dataContext.projectScopeUp = false;
                                    dataContext.projectScopeDown = false;

                                    for (let p of this.projectRefs) {
                                        let context = Ext.clone(dataContext);
                                        context.project = p;

                                        let artifactStore = Ext.create('Rally.data.wsapi.Store', {
                                            model: this.modelName,
                                            context,
                                            fetch,
                                            autoLoad: false,
                                            enablePostGet: true,
                                            filters: filters,
                                            limit: Infinity
                                        });

                                        promises.push(artifactStore.load());
                                    }
                                }
                                else {
                                    let artifactStore = Ext.create('Rally.data.wsapi.Store', {
                                        model: this.modelName,
                                        context: dataContext,
                                        fetch,
                                        autoLoad: false,
                                        enablePostGet: true,
                                        filters: filters,
                                        limit: Infinity
                                    });

                                    promises.push(artifactStore.load());
                                }

                                this.setLoading('Loading Artifact Data...');

                                return Deft.Promise.all(promises).then({
                                    scope: this,
                                    success: function (artifacts) {
                                        if (status.cancelLoad) {
                                            return;
                                        }

                                        artifacts = _.flatten(artifacts);

                                        // Augment each artifact with Planned, Delivered and timebox Added Date
                                        _.each(artifacts, function (artifact) {
                                            var snapshot = snapshotByOid[artifact.get('ObjectID')];
                                            var validFrom = snapshot.get('_ValidFrom')
                                            if (validFrom <= planningWindowEndIso) {
                                                artifact.set('Planned', true);
                                            }
                                            var acceptedDate = artifact.get(this.acceptedDateField);
                                            if (acceptedDate) {
                                                var acceptedIso = acceptedDate.toISOString();
                                                if (acceptedIso <= timeboxEndIso) {
                                                    artifact.set('Delivered', true);
                                                }
                                                // Special case where artifact may be assigned to timeboxes that occur after
                                                // its accepted date. We may want to render these differently so they don't
                                                // show up as 'Delivered' in multiple timeboxes.
                                                if (acceptedIso < timeboxStartIso) {
                                                    artifact.set('AcceptedBeforeTimeboxStart', true);
                                                }
                                            }
                                            artifact.set('timeboxAddedDate', new Date(validFrom));
                                            artifact.set('timeboxName', timebox.get('Name'));
                                            artifact.set('timeboxStartDate', timebox.get(this.timeboxStartDateField));
                                            artifact.set('timeboxEndDate', timebox.get(this.timeboxEndDateField))
                                        }, this);
                                        return {
                                            timebox,
                                            artifacts
                                        }
                                    },
                                    failure: function (e) {
                                        this.showError(e, 'Failed while loading artifact data');
                                        this.setLoading(false);
                                    }
                                });
                            }
                        },
                        failure: function (e) {
                            this.setLoading(false);
                            this.showError(e, 'Failed while loading historical data. Request may have timed out.');
                            status.cancelLoad;
                        }
                    })
                }, this);
                return Deft.Promise.all(promises)
            }
        }).then({
            scope: this,
            success: function (data) {
                if (status.cancelLoad) {
                    return;
                }

                this.data = data;
                return this.getChartConfig(this.data);
            }
        });
    },

    getChartConfig: function (data) {
        if (!data) {
            return;
        }

        var sortedData = _.sortBy(data, function (datum) {
            return datum.timebox.get(this.timeboxStartDateField).toISOString();
        }, this);
        var timeboxNames = [];
        var plannedCommitted = [];
        var plannedDelivered = [];
        var unplannedComitted = [];
        var unplannedDelivered = [];
        this.currentData = [];
        _.each(sortedData, function (datum, index, collection) {
            var pc = 0,
                pd = 0,
                uc = 0,
                ud = 0;

            var timeboxName = datum.timebox.get('Name');
            // If this is the current in-progress timebox, annotate its name
            if (this.down('#currentTimeboxCheckbox').getValue() && index == collection.length - 1) {
                if (datum.timebox.get(this.timeboxEndDateField) >= new Date()) {
                    timeboxName = timeboxName + Constants.IN_PROGRESS;
                }
            }
            timeboxNames.push(timeboxName);

            if (datum.artifacts) {
                for (let artifact of datum.artifacts) {
                    if (artifact.get('AcceptedBeforeTimeboxStart')) {
                        // Special case. The artifact was accepted before the timebox started. The work occurred
                        // *before* this timebox started and is NOT therefore included in the timebox as committed
                        // or delivered.
                        console.log('AcceptedBeforeTimeboxStart', artifact);
                    }
                    else {
                        this.currentData.push(artifact.data);
                        if (artifact.get('Planned')) {
                            pc++; // Committed and planned
                            if (artifact.get('Delivered')) {
                                pd++ // Planned and delivered
                            }
                        }
                        else {
                            uc++; // Comitted and unplanned 
                            if (artifact.get('Delivered')) {
                                ud++ // Unplanned and delivered
                            }
                        }
                    }
                };
            }
            plannedCommitted.push(pc);
            plannedDelivered.push(pd);
            unplannedComitted.push(uc);
            unplannedDelivered.push(ud);
        }, this);

        var title = "Stories";
        if (this.isPiTypeSelected()) {
            title = this.lowestPiType.get('Name') + 's';
        }
        return {
            xtype: 'rallychart',
            loadMask: false,
            chartColors: [
                "#FAD200", // $yellow
                "#8DC63F", // $lime
            ],
            chartConfig: {
                chart: {
                    type: 'column',
                    animation: false
                },
                title: {
                    text: title + ' ' + Constants.CHART_TITLE + ' by ' + this.timeboxType
                },
                legend: {
                    layout: 'vertical',
                    labelFormatter: function () {
                        var result = this.name;
                        if (this.name == Constants.UNPLANNED) {
                            var app = Rally.getApp();
                            var timeboxType = app.down('#timeboxTypeCombo').getValue();
                            var days = app.down('#planningWindowInput').getValue();
                            result = `${this.name} (added to ${timeboxType} more than ${days} day${days > 1 ? 's' : ''} after start)`;
                        }
                        return result;
                    }
                },
                plotOptions: {
                    column: {
                        stacking: 'normal'
                    },
                    series: {
                        animation: false,
                        dataLabels: {
                            align: 'center',
                            verticalAlign: 'top',
                        },
                        events: {
                            legendItemClick: function () { return false; } // Disable hiding some of data on legend click
                        }
                    }
                },
                yAxis: {
                    allowDecimals: false,
                    title: {
                        text: Constants.Y_AXIS_TITLE
                    }
                }
            },
            chartData: {
                categories: timeboxNames,
                series: [{
                    dataLabels: {
                        enabled: true,
                        format: '{total} ' + Constants.COMMITTED,
                        inside: false,
                        y: -20,
                        overflow: 'justify'
                    },
                    data: unplannedComitted,
                    stack: 0,
                    legendIndex: 2,
                    name: Constants.UNPLANNED
                }, {
                    data: plannedCommitted,
                    stack: 0,
                    legendIndex: 1,
                    name: Constants.PLANNED
                }, {
                    dataLabels: {
                        enabled: true,
                        format: '{total} ' + Constants.DELIVERED,
                        inside: false,
                        y: -20,
                        overflow: 'justify'
                    },
                    data: unplannedDelivered,
                    stack: 1,
                    showInLegend: false,
                    name: Constants.UNPLANNED
                }, {
                    data: plannedDelivered,
                    stack: 1,
                    showInLegend: false,
                    name: Constants.PLANNED
                }]
            }
        }
    },

    getTimeboxes: function () {
        // Get the N most recent timeboxes in the current project
        // Sort by name
        // Get timeboxes by name from all child projects

        var timeboxFilterProperty = this.timeboxEndDateField;
        if (this.down('#currentTimeboxCheckbox').getValue()) {
            timeboxFilterProperty = this.timeboxStartDateField;
        }
        let dataContext = this.getContext().getDataContext();
        dataContext.projectScopeDown = false;
        dataContext.projectScopeUp = false;
        let picker = this.down('#projectPicker');
        let projects = picker.getValue();
        if (projects.length) {
            dataContext.project = projects[0].get('_ref');
        }

        return Ext.create('Rally.data.wsapi.Store', {
            model: this.timeboxType,
            autoLoad: false,
            context: dataContext,
            sorters: [{
                property: timeboxFilterProperty,
                direction: 'DESC'
            }],
            filters: [{
                property: timeboxFilterProperty,
                operator: '<=',
                value: 'today'
            }],
            pageSize: this.down('#timeboxCountInput').getValue()
        }).load().then({
            scope: this,
            success: function (timeboxes) {
                var timeboxFilter = _.map(timeboxes, function (timebox) {
                    return Rally.data.wsapi.Filter.and([{
                        property: 'Name',
                        value: timebox.get('Name')
                    }, {
                        property: this.timeboxStartDateField,
                        value: timebox.get(this.timeboxStartDateField)
                    }, {
                        property: this.timeboxEndDateField,
                        value: timebox.get(this.timeboxEndDateField)
                    }]);
                }, this);
                if (timeboxFilter.length) {
                    timeboxFilter = Rally.data.wsapi.Filter.or(timeboxFilter);

                    if (this.useSpecificProjects()) {
                        timeboxFilter = timeboxFilter.and(new Rally.data.wsapi.Filter({
                            property: 'Project',
                            operator: 'in',
                            value: this.projectRefs
                        }));
                    }
                    return timeboxFilter;
                }
                else {
                    return null;
                }
            }
        }).then({
            scope: this,
            success: function (timeboxFilter) {
                if (timeboxFilter) {
                    let context = this.getContext().getDataContext();
                    if (this.useSpecificProjects()) {
                        context.project = null;
                    }

                    return Ext.create('Rally.data.wsapi.Store', {
                        model: this.timeboxType,
                        context: context,
                        autoLoad: false,
                        fetch: ['ObjectID', this.timeboxStartDateField, this.timeboxEndDateField, 'Name'],
                        enablePostGet: true,
                        limit: 10000,
                        pageSize: 10000,
                        sorters: [{
                            property: this.timeboxEndDateField,
                            direction: 'DESC'
                        }],
                        filters: [timeboxFilter]
                    }).load();
                }
                else {
                    return [];
                }
            }
        }).then({
            scope: this,
            success: function (timeboxes) {
                // Group by timebox name
                return _.groupBy(timeboxes, function (timebox) {
                    return timebox.get('Name');
                });
            }
        })
    },

    getSnapshotsFromTimeboxGroup: function (timeboxGroup) {
        var timebox = timeboxGroup[0]; // Representative timebox for the group
        var timeboxOids = _.map(timeboxGroup, function (timebox) {
            return timebox.get('ObjectID');
        });
        var timeboxEndIso = timebox.get(this.timeboxEndDateField).toISOString();
        var planningWindowEndIso = Ext.Date.add(timebox.get(this.timeboxStartDateField), Ext.Date.DAY, this.down('#planningWindowInput').getValue()).toISOString();
        var dateFilter = Rally.data.lookback.QueryFilter.and([{
            property: '_ValidFrom',
            operator: '<=',
            value: timeboxEndIso
        },
        {
            property: '_ValidTo',
            operator: '>=',
            value: planningWindowEndIso
        }
        ]);
        var dataContext = this.getContext().getDataContext();

        var filters = [{
            property: '_TypeHierarchy',
            value: this.modelName
        },
            dateFilter
        ];

        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        else {
            if (this.useSpecificProjects()) {
                dataContext.project = null;
            }
            filters.push({
                property: 'Project',
                operator: 'in',
                value: this.projects
            });
        }

        let promises = [];

        if (timeboxOids.length <= 4) {
            filters.push({
                property: this.timeboxType,
                operator: 'in',
                value: timeboxOids
            });

            let store = Ext.create('Rally.data.lookback.SnapshotStore', {
                autoLoad: false,
                context: dataContext,
                fetch: [this.timeboxType, '_ValidFrom', '_ValidTo', 'ObjectID'],
                hydrate: [this.timeboxType],
                remoteSort: false,
                compress: true,
                enablePostGet: true,
                filters: filters,
                limit: 40000,
                includeTotalResultCount: false,
                removeUnauthorizedSnapshots: true
            });

            promises.push(store.load());
        }
        else {
            let chunks = this.chunk(timeboxOids, 4);

            for (let chunk of chunks) {
                let newFilter = filters.concat({
                    property: this.timeboxType,
                    operator: 'in',
                    value: chunk
                });

                let store = Ext.create('Rally.data.lookback.SnapshotStore', {
                    autoLoad: false,
                    context: dataContext,
                    fetch: [this.timeboxType, '_ValidFrom', '_ValidTo', 'ObjectID'],
                    hydrate: [this.timeboxType],
                    remoteSort: false,
                    compress: true,
                    enablePostGet: true,
                    filters: newFilter,
                    limit: 40000,
                    includeTotalResultCount: false,
                    removeUnauthorizedSnapshots: true
                });

                promises.push(store.load());
            }
        }

        return Deft.Promise.all(promises);
    },

    async _getScopedProjectList() {
        let projectStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            fetch: ['Name', 'ObjectID', 'Children', 'Parent'],
            filters: [{ property: 'ObjectID', value: this.getContext().getProject().ObjectID }],
            limit: 1,
            pageSize: 1,
            autoLoad: false
        });

        let results = await projectStore.load();
        let parents = [];
        let children = [];
        if (results && results.length) {
            if (this.getContext().getProjectScopeDown()) {
                children = await this._getAllChildProjects(results);
            }

            if (this.getContext().getProjectScopeUp()) {
                parents = await this._getAllParentProjects(results[0]);
            }

            if (children.length) {
                results = children.concat(parents);
            }
            else if (parents.length) {
                results = parents;
            }

            this.projects = _.map(results, (p) => {
                return p.get('ObjectID');
            });

            this.projectRefs = _.map(results, (p) => {
                return p.get('_ref');
            });
        }
        this.projects = [];
        this.projectRefs = [];
    },

    async _getSpecificProjectList() {
        let projects = this.projectPicker.getValue();

        if (this.down('#includeChildProjectsCheckbox').getValue()) {
            projects = await this._getAllChildProjects(projects);
        }

        this.projects = _.map(projects, (p) => {
            return p.get('ObjectID');
        });

        this.projectRefs = _.map(projects, (p) => {
            return p.get('_ref');
        });
    },

    async _getAllChildProjects(allRoots = [], fetch = ['Name', 'Children', 'ObjectID']) {
        if (!allRoots.length) { return []; }

        const promises = allRoots.map(r => this._wrap(r.getCollection('Children', { fetch, limit: Infinity }).load()));
        const children = _.flatten(await Promise.all(promises));
        const decendents = await this._getAllChildProjects(children, fetch);
        const removeDupes = {};
        let finalResponse = _.flatten([...decendents, ...allRoots, ...children]);

        // eslint-disable-next-line no-return-assign
        finalResponse.forEach(s => removeDupes[s.get('_ref')] = s);
        finalResponse = Object.values(removeDupes);
        return finalResponse;
    },

    async _getAllParentProjects(p) {
        let projectStore = Ext.create('Rally.data.wsapi.Store', {
            model: 'Project',
            fetch: ['Name', 'ObjectID', 'Parent'],
            filters: [{ property: 'ObjectID', value: p.get('Parent').ObjectID }],
            limit: 1,
            pageSize: 1,
            autoLoad: false
        });

        let results = await projectStore.load();
        if (results && results.length) {
            if (results[0].get('Parent')) {
                let parents = await this._getAllParentProjects(results[0]);
                return [p].concat(parents);
            }
            return [p, results[0]];
        }
        return [p];
    },

    async _wrap(deferred) {
        if (!deferred || !_.isFunction(deferred.then)) {
            return Promise.reject(new Error('Wrap cannot process this type of data into a ECMA promise'));
        }
        return new Promise((resolve, reject) => {
            deferred.then({
                success(...args) {
                    resolve(...args);
                },
                failure(error) {
                    reject(error);
                }
            });
        });
    },

    _addGridboard: function (chartConfig) {
        var gridArea = this.down('#grid-area');
        gridArea.removeAll();

        var context = this.getContext();
        this.gridboard = gridArea.add({
            xtype: 'rallygridboard',
            context: context,
            modelNames: [this.modelName],
            toggleState: 'chart',
            height: gridArea.getHeight() - Constants.APP_RESERVED_HEIGHT,
            chartConfig: chartConfig,
            listeners: {
                scope: this,
                viewchange: this.viewChange,
            }
        });
    },

    isPiTypeSelected: function () {
        return this.modelName.toLowerCase().indexOf('portfolioitem') > -1;
    },

    addSettingItems: function () {
        var timeboxTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: [
                { name: Constants.TIMEBOX_TYPE_ITERATION_LABEL, value: Constants.TIMEBOX_TYPE_ITERATION },
                { name: Constants.TIMEBOX_TYPE_RELEASE_LABEL, value: Constants.TIMEBOX_TYPE_RELEASE },
            ]
        });
        var typeStoreData = [
            { name: 'User Story', value: 'HierarchicalRequirement' },
            { name: 'Feature', value: 'PortfolioItem/Feature' }
        ];

        var artifactTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: typeStoreData
        });

        let context = this.getContext();

        this.down('#settingsTab').add([{
            xtype: 'combobox',
            name: 'artifactType',
            itemId: 'artifactTypeCombo',
            value: this.getSetting('artifactType'),
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-artifact-type-combo'),
            stateEvents: ['change'],
            fieldLabel: 'Artifact type',
            labelWidth: this.labelWidth,
            store: artifactTypeStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    this.setModelFieldsForType(newValue);

                    // If Feature, also update timebox type to 'Release' and disable
                    // If change is fired due to setting state, timebox type 
                    // hasn't been created yet, so wait a bit first
                    setTimeout(() => {
                        let timeboxTypeControl = this.down('#timeboxTypeCombo');
                        if (timeboxTypeControl) {
                            if (this.isPiTypeSelected()) {
                                timeboxTypeControl.setValue(Constants.TIMEBOX_TYPE_RELEASE);
                                timeboxTypeControl.disable(); // User cannot pick other timeboxes for Features
                            }
                            else {
                                timeboxTypeControl.enable();
                            }
                        }
                    }, 200);

                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplySettingsBtn();
                    }
                }
            }
        },
        {
            xtype: 'combobox',
            id: 'timeboxTypeCombo',
            value: this.getSetting('timeboxType'),
            disabled: this.getSetting('artifactType') === 'PortfolioItem/Feature',
            fieldLabel: 'Timebox type',
            labelWidth: this.labelWidth,
            store: timeboxTypeStore,
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-timebox-type-combo'),
            stateEvents: ['change'],
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    this.setTimeboxFieldsForType(newValue);

                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplySettingsBtn();
                    }
                }
            }
        },
        {
            xtype: 'rallynumberfield',
            itemId: 'timeboxCountInput',
            value: this.getSetting('timeboxCount'),
            fieldLabel: "Timebox Count",
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-timebox-count-input'),
            stateEvents: ['change'],
            labelWidth: this.labelWidth,
            minValue: 1,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    this.showApplySettingsBtn();
                }
            }
        }, {
            xtype: 'rallynumberfield',
            itemId: 'planningWindowInput',
            value: this.getSetting('planningWindow'),
            fieldLabel: 'Timebox planning window (days)',
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-planning-window-input'),
            stateEvents: ['change'],
            labelWidth: this.labelWidth,
            minValue: 0,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    this.showApplySettingsBtn();
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            itemId: 'currentTimeboxCheckbox',
            value: this.getSetting('currentTimebox'),
            fieldLabel: 'Show current, in-progress timebox',
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-current-timebox-checkbox'),
            stateEvents: ['change'],
            labelWidth: this.labelWidth,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplySettingsBtn();
                    }
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            itemId: 'respectTimeboxFilteredPageCheckbox',
            value: this.getSetting('respectTimeboxFilteredPage'),
            fieldLabel: 'Respect filter on timebox filtered pages',
            labelWidth: this.labelWidth,
            stateful: true,
            stateId: context.getScopedStateId('committedvdelivered-respect-timebox-page-checkbox'),
            stateEvents: ['change'],
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (this.loading) {
                        return;
                    }

                    if (newValue != oldValue) {
                        this.showApplySettingsBtn();
                    }
                }
            }
        }, {
            xtype: 'rallybutton',
            itemId: 'applySettingsBtn',
            text: 'Apply',
            hidden: true,
            handler: function (btn) {
                btn.hide();
                this.viewChange();
            }.bind(this)
        }
        ]);
    },

    addProjectPicker: function () {
        this.down('#projectsTab').add(
            {
                xtype: 'component',
                html: `If you require a report spanning across multiple project hierarchies, use this project picker to specify where the data will be pulled from. If blank, app will respect user's current project scoping.`
            },
            {
                xtype: 'customagilepillpicker',
                itemId: 'projectPicker',
                hidden: false,
                statefulKey: `${this.getAppId()}-${this.appName}-${this.getContext().getProject()._refObjectUUID}-project`,
                defaultToRecentTimeboxes: false,
                listeners: {
                    recordremoved: this.showApplyProjectsBtn,
                    scope: this
                },
                pickerCfg: {
                    xtype: 'customagilemultiselectproject',
                    width: 350,
                    margin: '10 0 0 0',
                    listeners: {
                        blur: this.showApplyProjectsBtn,
                        scope: this
                    }
                }
            },
            {
                xtype: 'rallycheckboxfield',
                itemId: 'includeChildProjectsCheckbox',
                fieldLabel: 'Show work from child projects',
                stateful: true,
                stateId: this.getContext().getScopedStateId('committedvdelivered-scope-down-checkbox'),
                stateEvents: ['change'],
                labelWidth: 200,
                listeners: {
                    scope: this,
                    change: this.showApplyProjectsBtn
                }
            },
            {
                xtype: 'rallybutton',
                itemId: 'applyProjectsBtn',
                text: 'Apply',
                margin: '10 0 0 0',
                hidden: true,
                handler: function (btn) {
                    btn.hide();
                    this.projectListChange();
                }.bind(this)
            }
        );
    },

    showApplySettingsBtn: function () {
        this.down('#applySettingsBtn').show();
    },

    showApplyProjectsBtn: function () {
        this.down('#applyProjectsBtn') && this.down('#applyProjectsBtn').show();
    },

    updateFilterTabText: function (filters) {
        var totalFilters = 0;
        _.each(filters, function (filter) {
            totalFilters += filter.length;
        });

        var titleText = totalFilters ? `FILTERS (${totalFilters})` : 'FILTERS';
        var tab = this.down('#filterAndSettingsPanel').child('#filtersTab');

        if (tab) { tab.setTitle(titleText); }
    },

    updateProjectTabText: function () {
        let picker = this.down('#projectPicker');
        totalProjects = picker.getValue().length;

        var titleText = totalProjects ? `PROJECTS (${totalProjects})` : 'PROJECTS';
        var tab = this.down('#filterAndSettingsPanel').child('#projectsTab');

        if (tab) { tab.setTitle(titleText); }
    },

    viewChange: async function () {
        var gridArea = this.down('#grid-area');
        gridArea.removeAll();
        this.setLoading(true);
        this.addControls();
        this.down('#applyFiltersBtn').disable();
        this.down('#applySettingsBtn').hide();
        this.down('#applyProjectsBtn').hide();
        this.updateProjectTabText();
        let status = this.cancelPreviousLoad();
        this.projectPicker = this.down('#projectPicker');
        let artifactType = this.down('#artifactTypeCombo').getValue();

        if (this.artifactType) {
            if (this.artifactType !== artifactType) {
                this.artifactType = artifactType;
                this.ancestorAndMultiFilters = await this.ancestorFilterPlugin.getAllFiltersForType(this.artifactType, true).catch((e) => {
                    Rally.ui.notify.Notifier.showError({ message: (e.message || e) });
                });

                if (!this.ancestorAndMultiFilters) {
                    return;
                }
            }
        }
        else {
            this.artifactType = this.down('#artifactTypeCombo').getValue();
        }

        if (!this.projects && !this.searchAllProjects()) {
            await this.loadProjects();

            if (!this.projects || !this.projects.length) {
                this.showError('Failed to fetch list of project IDs');
                this.setLoading(false);
                return;
            }
        }

        this._buildChartConfig(status).then({
            scope: this,
            success: function (chartConfig) {
                if (status.cancelLoad) {
                    return;
                }

                this._addGridboard(chartConfig);
                this.setLoading(false);
                this.resizeChart();
            }
        });
    },

    async loadProjects() {
        this.setLoading('Loading Project List...');

        if (this.useSpecificProjects()) {
            await this._getSpecificProjectList();
        }
        else {
            if (this.getContext().getProjectScopeDown() || this.getContext().getProjectScopeUp()) {
                await this._getScopedProjectList();
            }
            else {
                this.projects = [this.getContext().getProject().ObjectID];
                this.projectRefs = [this.getContext().getProject()._ref];
            }
        }
    },

    async projectListChange() {
        await this.loadProjects();
        this.viewChange();
    },

    cancelPreviousLoad: function () {
        if (this.globalStatus) {
            this.globalStatus.cancelLoad = true;
        }

        let newStatus = { cancelLoad: false };
        this.globalStatus = newStatus;
        return newStatus;
    },

    searchAllProjects() {
        return this.ancestorFilterPlugin.getIgnoreProjectScope();
    },

    getModelScopedStateId: function (modelName, id) {
        return this.getContext().getScopedStateId(modelName + '-' + id);
    },

    getSettingsFields: function () {
        var timeboxTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: [
                { name: Constants.TIMEBOX_TYPE_ITERATION_LABEL, value: Constants.TIMEBOX_TYPE_ITERATION },
                { name: Constants.TIMEBOX_TYPE_RELEASE_LABEL, value: Constants.TIMEBOX_TYPE_RELEASE },
            ]
        });
        var typeStoreData = [
            { name: 'User Story', value: 'HierarchicalRequirement' },
            { name: 'Feature', value: 'PortfolioItem/Feature' },
        ];

        var artifactTypeStore = Ext.create('Ext.data.Store', {
            fields: ['name', 'value'],
            data: typeStoreData
        });
        return [{
            xtype: 'combobox',
            name: 'artifactType',
            value: this.getSetting('artifactType'),
            fieldLabel: 'Artifact type',
            labelWidth: this.labelWidth,
            store: artifactTypeStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                artifactType: newValue
                            }
                        });
                        // Choice of artifact has changed
                        this.setModelFieldsForType(newValue);
                        // If Feature, also update timebox type to 'Release'
                        var timeboxTypeControl = Ext.ComponentManager.get('timeboxType');
                        if (this.isPiTypeSelected()) {
                            timeboxTypeControl.setValue(Constants.TIMEBOX_TYPE_RELEASE);
                            timeboxTypeControl.disable(); // User cannot pick other timeboxes for Features
                        }
                        else {
                            timeboxTypeControl.enable();
                        }
                    }
                }
            }
        },
        {
            xtype: 'combobox',
            name: 'timeboxType',
            id: 'timeboxType',
            value: this.getSetting('timeboxType'),
            fieldLabel: 'Timebox type',
            labelWidth: this.labelWidth,
            store: timeboxTypeStore,
            queryMode: 'local',
            displayField: 'name',
            valueField: 'value',
            disabled: this.isPiTypeSelected(),
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                timeboxType: newValue
                            }
                        });
                        // Choice of timebox has changed
                        this.setTimeboxFieldsForType(newValue);
                    }
                }
            }
        },
        {
            xtype: 'rallynumberfield',
            name: 'timeboxCount',
            value: this.getSetting('timeboxCount'),
            fieldLabel: "Timebox Count",
            labelWidth: this.labelWidth,
            minValue: 1,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                timeboxCount: newValue
                            }
                        });
                    }
                }
            }
        }, {
            xtype: 'rallynumberfield',
            name: 'planningWindow',
            value: this.getSetting('planningWindow'),
            fieldLabel: 'Timebox planning window (days)',
            labelWidth: this.labelWidth,
            minValue: 0,
            allowDecimals: false,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                planningWindow: newValue
                            }
                        });
                    }
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            name: 'currentTimebox',
            value: this.getSetting('currentTimebox'),
            fieldLabel: 'Show current, in-progress timebox',
            labelWidth: this.labelWidth,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                currentTimebox: newValue
                            }
                        });
                    }
                }
            }
        }, {
            xtype: 'rallycheckboxfield',
            name: 'respectTimeboxFilteredPage',
            value: this.getSetting('respectTimeboxFilteredPage'),
            fieldLabel: 'Respect filter on timebox filtered pages',
            labelWidth: this.labelWidth,
            listeners: {
                scope: this,
                change: function (field, newValue, oldValue) {
                    if (newValue != oldValue) {
                        this.updateSettingsValues({
                            settings: {
                                respectTimeboxFilteredPage: newValue
                            }
                        });
                    }
                }
            }
        }
        ]
    },

    useSpecificProjects() {
        return !!this.projectPicker.getValue().length;
    },

    showError(msg) {
        Rally.ui.notify.Notifier.showError({ message: this.parseError(msg) });
    },

    parseError(e, defaultMessage) {
        if (typeof e === 'string' && e.length) {
            return e;
        }
        if (e.message && e.message.length) {
            return e.message;
        }
        if (e.exception && e.error && e.error.errors && e.error.errors.length) {
            if (e.error.errors[0].length) {
                return e.error.errors[0];
            } else {
                if (e.error && e.error.response && e.error.response.status) {
                    return `${defaultMessage} (Status ${e.error.response.status})`;
                }
            }
        }
        if (e.exceptions && e.exceptions.length && e.exceptions[0].error) {
            return e.exceptions[0].error.statusText;
        }
        return defaultMessage;
    },

    baseSlice: function (array, start, end) {
        var index = -1,
            length = array.length;

        if (start < 0) {
            start = -start > length ? 0 : (length + start);
        }
        end = end > length ? length : end;
        if (end < 0) {
            end += length;
        }
        length = start > end ? 0 : ((end - start) >>> 0);
        start >>>= 0;

        var result = Array(length);
        while (++index < length) {
            result[index] = array[index + start];
        }
        return result;
    },

    chunk: function (array, size) {
        var length = array == null ? 0 : array.length;
        if (!length || size < 1) {
            return [];
        }
        var index = 0,
            resIndex = 0,
            result = Array(Math.ceil(length / size));

        while (index < length) {
            result[resIndex++] = this.baseSlice(array, index, (index += size));
        }
        return result;
    },

    setLoading(msg) {
        this.down('#grid-area').setLoading(msg);
    },

    showSettings: function () {
        if (this.collapseBtn) {
            this.collapseBtn.hide();
        }
        this.callParent(arguments);
    },

    hideSettings: function () {
        if (this.collapseBtn) {
            this.collapseBtn.show();
        }
        this.callParent(arguments);
    }
});
